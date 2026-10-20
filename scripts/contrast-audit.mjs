#!/usr/bin/env node
/**
 * Contrast audit (dev only, no dependencies).
 *
 * Loads every route of a running build in headless Chrome through the DevTools
 * protocol, in light and dark (the system setting and the site's theme toggle),
 * walks through each page's tabs, view switches, presets and step controls, and
 * measures the WCAG contrast ratio of every visible text node (HTML and SVG) and
 * form value against its effective background: backgrounds of the ancestors and,
 * in SVG, the shapes painted under the text, composited with opacity. It also
 * lists complementary landmarks that sit inside another landmark.
 *
 *   npm run build && npx vite preview --port 5193 --strictPort &
 *   node scripts/contrast-audit.mjs [--base http://localhost:5193] [--routes ll1,lr1]
 *     [--themes light,dark,toggle-dark,toggle-light] [--json out.json] [--quick]
 *     [--concurrency 4] [--chrome <path>] [--port 5293]
 *
 * Thresholds: 4.5:1 for text, 3:1 for large text (24 px, or 18.66 px bold) and
 * for arrow or shape glyphs hidden from assistive technology (graphics). Text of
 * disabled controls (WCAG exempts it) and text drawn under 20% opacity (faint
 * placeholders, such as steps still to come) are listed apart. Hover and focus styles
 * and results dimmed while they are recomputed (.stale-data) are not measured.
 * Exits with 1 when any text fails.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		base: { type: 'string', default: 'http://localhost:5193' },
		routes: { type: 'string' },
		themes: { type: 'string', default: 'light,dark,toggle-dark,toggle-light' },
		json: { type: 'string' },
		quick: { type: 'boolean', default: false },
		concurrency: { type: 'string', default: '4' },
		chrome: { type: 'string' },
		port: { type: 'string', default: '5293' },
		width: { type: 'string', default: '1300' },
		verbose: { type: 'boolean', default: false }
	}
});

/** Theme setups: the emulated system setting and the theme saved by the site's toggle. */
const THEMES = {
	light: { scheme: 'light', saved: null },
	dark: { scheme: 'dark', saved: null },
	'toggle-dark': { scheme: 'light', saved: 'dark' },
	'toggle-light': { scheme: 'dark', saved: 'light' }
};

const root = path.resolve(import.meta.dirname, '..');
const allRoutes = [
	'',
	...readdirSync(path.join(root, 'src/routes'), { withFileTypes: true })
		.filter(
			(d) => d.isDirectory() && existsSync(path.join(root, 'src/routes', d.name, '+page.svelte'))
		)
		.map((d) => d.name)
		.sort()
];
const routes = args.routes ? args.routes.split(',').map((r) => (r === 'home' ? '' : r)) : allRoutes;
const themes = args.themes.split(',');
for (const t of themes) if (!THEMES[t]) throw new Error(`Unknown theme ${t}`);

/* ------------------------------------------------------------------ */
/* In-page code (serialized with Function.prototype.toString)           */
/* ------------------------------------------------------------------ */

function auditInPage() {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const colors = new Map();
	/** CSS color → [r, g, b, a] (0–255, alpha 0–1), or null for none / url(). */
	function parse(str) {
		if (!str || str === 'none' || str.startsWith('url')) return null;
		if (colors.has(str)) return colors.get(str);
		let out;
		const rgb = str.match(/^rgba?\(([^)]+)\)$/);
		const srgb = str.match(/^color\(srgb ([^)]+)\)$/);
		if (rgb) {
			const p = rgb[1]
				.split(/[\s,/]+/)
				.filter(Boolean)
				.map(Number);
			out = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
		} else if (srgb) {
			const p = srgb[1]
				.split(/[\s/]+/)
				.filter(Boolean)
				.map(Number);
			out = [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
		} else if (str === 'transparent') {
			out = [0, 0, 0, 0];
		} else {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = '#000';
			ctx.fillStyle = str;
			ctx.fillRect(0, 0, 1, 1);
			const d = ctx.getImageData(0, 0, 1, 1).data;
			out = [d[0], d[1], d[2], d[3] / 255];
		}
		colors.set(str, out);
		return out;
	}
	const styles = new Map();
	const cs = (el) => {
		let s = styles.get(el);
		if (!s) styles.set(el, (s = getComputedStyle(el)));
		return s;
	};
	const premul = ([r, g, b, a]) => [r * a, g * a, b * a, a];
	const over = (t, b) => {
		const k = 1 - t[3];
		return [t[0] + b[0] * k, t[1] + b[1] * k, t[2] + b[2] * k, t[3] + b[3] * k];
	};
	const scale = (p, o) => p.map((x) => x * o);
	const unpremul = (p) => (p[3] > 0 ? [p[0] / p[3], p[1] / p[3], p[2] / p[3]] : [255, 255, 255]);
	const lin = (c) => {
		c /= 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	const ratio = (a, b) => {
		const la = lum(a);
		const lb = lum(b);
		return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
	};
	const hex = (c) =>
		'#' +
		c
			.slice(0, 3)
			.map((x) =>
				Math.round(Math.min(255, Math.max(0, x)))
					.toString(16)
					.padStart(2, '0')
			)
			.join('');

	/** Root color tokens by value, to name the colors of a failure. */
	const tokenNames = new Map();
	{
		const names = new Set();
		const visit = (rules) => {
			for (const rule of rules) {
				if (rule.cssRules) visit(rule.cssRules);
				if (rule.selectorText && /^:root/.test(rule.selectorText))
					for (const m of rule.cssText.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);
			}
		};
		for (const sheet of document.styleSheets) {
			try {
				visit(sheet.cssRules);
			} catch {
				/* cross-origin sheet */
			}
		}
		const rootStyle = getComputedStyle(document.documentElement);
		for (const name of names) {
			if (
				/^--(syn-|focus|shadow|backdrop|font|accent-contrast|state-fill|text-(xs|sm|base|lg|xl|2xl|3xl)$)/.test(
					name
				)
			)
				continue;
			const value = rootStyle.getPropertyValue(name).trim();
			if (!value || /^[\d.]+(px|rem|em|ch|ms)?$/.test(value)) continue;
			const c = parse(value);
			if (!c || c[3] < 1) continue;
			const key = hex(c);
			tokenNames.set(key, [...(tokenNames.get(key) ?? []), name]);
		}
	}
	const tokenOf = (c) => {
		const key = hex(c);
		return tokenNames.get(key)?.join('/') ?? key;
	};

	const hiddenCache = new Map();
	/** Visually hidden (clipped to nothing, or inside a collapsed overflow box). */
	function clippedAway(el) {
		if (!el || el === document.body) return false;
		if (hiddenCache.has(el)) return hiddenCache.get(el);
		const s = cs(el);
		let hidden = false;
		if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') hidden = true;
		else if (s.overflow !== 'visible' && !(el instanceof SVGElement)) {
			const r = el.getBoundingClientRect();
			if (r.width < 2 || r.height < 2) hidden = true;
		}
		if (!hidden) hidden = clippedAway(el.parentElement);
		hiddenCache.set(el, hidden);
		return hidden;
	}

	function describe(el) {
		const parts = [];
		for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) {
			const cls = [...e.classList].filter((c) => !/^svelte-/.test(c)).slice(0, 3);
			parts.unshift(e.tagName.toLowerCase() + cls.map((c) => '.' + c).join(''));
		}
		return parts.join(' > ');
	}

	/** Composite the text layer T and the background layer B through the HTML ancestors of el. */
	function throughAncestors(el, T, B, info) {
		for (let e = el; e; e = e.parentElement) {
			const s = cs(e);
			if (s.backgroundImage && s.backgroundImage !== 'none' && !info.bgImage)
				info.bgImage = describe(e);
			const bg = parse(s.backgroundColor);
			if (bg && bg[3] > 0) {
				const p = premul(bg);
				T = over(T, p);
				B = over(B, p);
			}
			const o = parseFloat(s.opacity);
			if (o < 1) {
				T = scale(T, o);
				B = scale(B, o);
				info.opacity *= o;
			}
		}
		const white = [255, 255, 255, 1];
		return { text: unpremul(over(T, white)), bg: unpremul(over(B, white)) };
	}

	/** Fills painted under an SVG text element at (x, y), bottom to top. */
	function svgLayers(textEl, x, y) {
		let svg = textEl.closest('svg');
		while (svg?.parentElement?.closest('svg')) svg = svg.parentElement.closest('svg');
		const layers = [];
		if (!svg) return { svg, layers };
		for (const sh of svg.querySelectorAll('rect, circle, ellipse, path, polygon')) {
			if (!(textEl.compareDocumentPosition(sh) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
			if (sh.closest('defs, marker, clipPath, mask, pattern, symbol')) continue;
			const s = cs(sh);
			if (s.display === 'none' || s.visibility !== 'visible') continue;
			const fill = parse(s.fill);
			if (!fill) continue;
			let a = fill[3] * parseFloat(s.fillOpacity);
			for (let e = sh; e && e !== svg; e = e.parentElement) a *= parseFloat(cs(e).opacity);
			if (a <= 0.01) continue;
			const ctm = sh.getScreenCTM();
			if (!ctm) continue;
			const pt = new DOMPoint(x, y).matrixTransform(ctm.inverse());
			try {
				if (!sh.isPointInFill(pt)) continue;
			} catch {
				continue;
			}
			layers.push(premul([fill[0], fill[1], fill[2], a]));
		}
		return { svg, layers };
	}

	/** Arrows, bullets, shapes and marks: drawn as graphics when hidden from assistive technology. */
	const GLYPH = /^[\u2190-\u21ff\u2022\u2026\u25a0-\u25ff\u2713\u2717\u00b7\u2212\u27e8\u27e9]+$/u;
	const fails = [];
	const exempt = [];
	let checked = 0;

	function check(el, text, fg, rect, kind) {
		const s = cs(el);
		const info = { opacity: 1, bgImage: null };
		let T = premul(fg);
		let B = [0, 0, 0, 0];
		let result;
		if (el instanceof SVGElement) {
			const svgRoot = el.closest('svg');
			for (let e = el; e && e !== svgRoot; e = e.parentElement) {
				const o = parseFloat(cs(e).opacity);
				if (o < 1) {
					T = scale(T, o);
					info.opacity *= o;
				}
			}
			const { svg, layers } = svgLayers(el, rect.x + rect.width / 2, rect.y + rect.height / 2);
			const halo = parse(s.stroke);
			if (halo && /^stroke/.test(s.paintOrder) && parseFloat(s.strokeWidth) >= 3) {
				layers.push(premul([halo[0], halo[1], halo[2], halo[3] * parseFloat(s.strokeOpacity)]));
			}
			for (let i = layers.length - 1; i >= 0; i--) {
				T = over(T, layers[i]);
				B = over(B, layers[i]);
			}
			result = throughAncestors(svg ?? el, T, B, info);
		} else {
			result = throughAncestors(el, T, B, info);
		}
		if (info.opacity < 0.05) return; // invisible (e.g. a hint shown on focus)
		checked++;
		const size = parseFloat(s.fontSize);
		const weight = parseInt(s.fontWeight, 10) || 400;
		const large = size >= 24 || (size >= 18.66 && weight >= 700);
		const hidden = !!el.closest('[aria-hidden="true"]');
		const glyph = GLYPH.test(text);
		const need = large || (glyph && hidden) ? 3 : 4.5;
		const r = ratio(result.text, result.bg);
		if (r + 1e-9 >= need) return;
		const disabled =
			!!el.closest(
				'button:disabled, fieldset:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"], .disabled'
			) || !!el.closest('label')?.querySelector('input:disabled');
		const entry = {
			kind,
			text: text.slice(0, 40),
			sel: describe(el),
			ratio: Math.round(r * 100) / 100,
			need,
			fg: hex(result.text),
			bg: hex(result.bg),
			fgToken: tokenOf(fg),
			bgToken: tokenOf(result.bg),
			size: Math.round(size * 10) / 10,
			weight,
			hidden,
			glyph,
			opacity: Math.round(info.opacity * 100) / 100,
			bgImage: info.bgImage
		};
		// Disabled controls (WCAG exempts them) and faint placeholders (under 20% opacity,
		// e.g. steps still to come) are listed apart.
		const reason = disabled ? 'disabled' : info.opacity < 0.2 ? 'faint' : null;
		(reason ? exempt : fails).push(reason ? { ...entry, reason } : entry);
	}

	const range = document.createRange();
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const text = n.data.replace(/\s+/g, ' ').trim();
		if (!text || /^[\u200b\u2060]+$/.test(text)) continue;
		const el = n.parentElement;
		if (!el || el.closest('script, style, noscript, template, title, textarea, option')) continue;
		const s = cs(el);
		if (s.visibility !== 'visible') continue;
		range.selectNodeContents(n);
		const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
		if (!rects.length || clippedAway(el)) continue;
		const fg =
			el instanceof SVGElement
				? (() => {
						const f = parse(s.fill);
						return f ? [f[0], f[1], f[2], f[3] * parseFloat(s.fillOpacity)] : null;
					})()
				: parse(s.webkitTextFillColor || s.color);
		if (!fg || fg[3] < 0.05) continue;
		check(el, text, fg, rects[0], 'text');
	}

	// Form values and placeholders.
	for (const el of document.querySelectorAll('input, textarea, select')) {
		const type = el.type;
		if (el.tagName === 'INPUT' && !['text', 'search', 'number', 'url', 'email', ''].includes(type))
			continue;
		const rect = el.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2 || cs(el).visibility !== 'visible' || clippedAway(el))
			continue;
		if (el.tagName === 'SELECT') {
			const text = el.options[el.selectedIndex]?.text ?? '';
			const fg = parse(cs(el).color);
			if (text && fg && fg[3] > 0.05) check(el, text, fg, rect, 'select');
		} else if (el.value) {
			const s = cs(el);
			const fg = parse(s.webkitTextFillColor || s.color);
			if (fg && fg[3] > 0.05) check(el, el.value.split('\n')[0], fg, rect, 'value');
		} else if (el.placeholder) {
			const p = getComputedStyle(el, '::placeholder');
			const fg = parse(p.webkitTextFillColor || p.color);
			if (fg && fg[3] > 0.05) {
				const a = parseFloat(p.opacity);
				if (a < 1) fg[3] *= a;
				check(el, el.placeholder, fg, rect, 'placeholder');
			}
		}
	}

	return {
		checked,
		fails,
		exempt,
		theme: document.documentElement.dataset.theme ?? null,
		bg: getComputedStyle(document.body).backgroundColor
	};
}

/** Selects the next tab or view switch not seen yet; returns its key. */
function nextViewInPage(visited) {
	const vis = (el) => {
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible';
	};
	const clean = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
	const items = [];
	for (const t of document.querySelectorAll('[role="tab"]')) {
		if (!vis(t) || t.disabled || t.getAttribute('aria-disabled') === 'true') continue;
		const list = t.closest('[role="tablist"]');
		items.push({
			el: t,
			key: `tab ${clean(list?.getAttribute('aria-label'))}: ${clean(t.textContent)}`,
			selected: t.getAttribute('aria-selected') === 'true'
		});
	}
	for (const r of document.querySelectorAll('[role="radiogroup"] input[type="radio"]')) {
		const label = r.closest('label');
		if (!label || !vis(label) || r.disabled) continue;
		const group = r.closest('[role="radiogroup"]');
		const by = group?.getAttribute('aria-labelledby');
		const name =
			group?.getAttribute('aria-label') ?? (by ? document.getElementById(by)?.textContent : '');
		items.push({
			el: r,
			key: `view ${clean(name)}: ${clean(label.textContent)}`,
			selected: r.checked
		});
	}
	// Switches: each one flipped once (and left flipped, so later views combine them).
	for (const s of document.querySelectorAll('input[role="switch"]')) {
		const label = s.closest('label');
		if (!label || !vis(label) || s.disabled) continue;
		const name = clean(label.querySelector('.label')?.textContent ?? label.textContent);
		items.push({ el: s, key: `switch ${name}`, selected: false });
	}
	const seen = items.filter((i) => i.selected).map((i) => i.key);
	const next = items.find((i) => !i.selected && !visited.includes(i.key) && !seen.includes(i.key));
	if (next) next.el.click();
	return { clicked: next?.key ?? null, seen };
}

/** Presses the first / next / last button of every visible step control; returns how many. */
function stepInPage(which) {
	let n = 0;
	for (const g of document.querySelectorAll('.step-controls')) {
		const r = g.getBoundingClientRect();
		if (!r.width || !r.height) continue;
		const b = [...g.querySelectorAll('button')].find((b) =>
			(b.getAttribute('aria-label') ?? '').toLowerCase().startsWith(which + ' ')
		);
		if (b && b.getAttribute('aria-disabled') !== 'true') {
			b.click();
			n++;
		}
	}
	return n;
}

/** Opens the first preset menu and, with an index, loads that preset. */
async function presetInPage(index) {
	const trigger = [...document.querySelectorAll('button[aria-haspopup="listbox"]')].find(
		(b) => b.getBoundingClientRect().width > 0 && !b.disabled
	);
	if (!trigger) return { count: 0 };
	if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
	await new Promise((r) => setTimeout(r, 60));
	const options = [...document.querySelectorAll('[role="option"]')];
	if (index === null) return { count: options.length };
	const option = options[index];
	const label = option?.querySelector('.option-label')?.textContent?.trim() ?? String(index);
	option?.click();
	return { count: options.length, label };
}

async function settleInPage() {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	await document.fonts.ready;
	await sleep(120);
	for (let i = 0; i < 60; i++) {
		if (!document.querySelector('[aria-busy="true"], .stale-data')) break;
		await sleep(100);
	}
	await sleep(60);
}

/* ------------------------------------------------------------------ */
/* DevTools protocol                                                    */
/* ------------------------------------------------------------------ */

class Connection {
	static async open(url) {
		const ws = new WebSocket(url);
		await new Promise((resolve, reject) => {
			ws.onopen = resolve;
			ws.onerror = reject;
		});
		return new Connection(ws);
	}
	constructor(ws) {
		this.ws = ws;
		this.seq = 0;
		this.pending = new Map();
		this.waiters = [];
		ws.onmessage = (e) => {
			const msg = JSON.parse(e.data);
			if (msg.id) {
				const p = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				if (msg.error) p?.reject(new Error(`${p.method}: ${msg.error.message}`));
				else p?.resolve(msg.result);
			} else {
				this.waiters = this.waiters.filter((w) => {
					if (w.method !== msg.method || w.sessionId !== msg.sessionId) return true;
					w.resolve(msg.params);
					return false;
				});
			}
		};
	}
	send(method, params = {}, sessionId) {
		const id = ++this.seq;
		this.ws.send(JSON.stringify({ id, method, params, sessionId }));
		return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
	}
	waitFor(method, sessionId, timeout = 30000) {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((x) => x !== w);
				reject(new Error(`timeout waiting for ${method}`));
			}, timeout);
			const w = {
				method,
				sessionId,
				resolve: (v) => {
					clearTimeout(timer);
					resolve(v);
				}
			};
			this.waiters.push(w);
		});
	}
	close() {
		this.ws.close();
	}
}

class Page {
	static async open(conn, theme) {
		const { browserContextId } = await conn.send('Target.createBrowserContext');
		const { targetId } = await conn.send('Target.createTarget', {
			url: 'about:blank',
			browserContextId
		});
		const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
		const page = new Page(conn, sessionId, targetId, browserContextId);
		await page.send('Page.enable');
		await page.send('Runtime.enable');
		await page.send('Accessibility.enable');
		await page.send('Emulation.setDeviceMetricsOverride', {
			width: Number(args.width),
			height: 900,
			deviceScaleFactor: 1,
			mobile: false
		});
		await page.send('Emulation.setEmulatedMedia', {
			features: [
				{ name: 'prefers-color-scheme', value: theme.scheme },
				{ name: 'prefers-reduced-motion', value: 'reduce' }
			]
		});
		const store = theme.saved
			? `localStorage.setItem('cs435-theme', ${JSON.stringify(theme.saved)})`
			: `localStorage.removeItem('cs435-theme')`;
		await page.send('Page.addScriptToEvaluateOnNewDocument', {
			source: `try { ${store} } catch {}`
		});
		return page;
	}
	constructor(conn, sessionId, targetId, contextId) {
		Object.assign(this, { conn, sessionId, targetId, contextId });
	}
	send(method, params) {
		return this.conn.send(method, params, this.sessionId);
	}
	async eval(fn, ...fnArgs) {
		const expression = `(${fn.toString()})(${fnArgs.map((a) => JSON.stringify(a)).join(',')})`;
		const r = await this.send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true
		});
		if (r.exceptionDetails)
			throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
		return r.result.value;
	}
	async goto(url) {
		await this.send('Page.navigate', { url: 'about:blank' });
		const loaded = this.conn.waitFor('Page.loadEventFired', this.sessionId);
		await this.send('Page.navigate', { url });
		await loaded;
		await new Promise((r) => setTimeout(r, 250)); // hydration
		await this.settle();
	}
	settle() {
		return this.eval(settleInPage);
	}
	/** Complementary landmarks inside another landmark, as Chrome maps them. */
	async nestedComplementary() {
		const { result } = await this.send('Runtime.evaluate', { expression: 'document' });
		const { nodes } = await this.send('Accessibility.queryAXTree', {
			objectId: result.objectId,
			role: 'complementary'
		});
		const landmarks = [
			'main',
			'navigation',
			'region',
			'complementary',
			'banner',
			'contentinfo',
			'form',
			'search'
		];
		const out = [];
		for (const node of nodes) {
			const { nodes: chain } = await this.send('Accessibility.getAXNodeAndAncestors', {
				backendNodeId: node.backendDOMNodeId
			});
			const outer = chain.slice(1).find((n) => landmarks.includes(n.role?.value));
			if (outer)
				out.push(
					`complementary "${node.name?.value ?? ''}" inside ${outer.role.value} "${outer.name?.value ?? ''}"`
				);
		}
		return out;
	}
	async close() {
		await this.conn.send('Target.closeTarget', { targetId: this.targetId });
		await this.conn.send('Target.disposeBrowserContext', { browserContextId: this.contextId });
	}
}

/* ------------------------------------------------------------------ */
/* Exploration                                                          */
/* ------------------------------------------------------------------ */

async function auditRoute(page, route, themeName) {
	const url = `${args.base}/${route}`;
	const states = [];
	const landmarks = new Set();
	const audit = async (state) => {
		const r = await page.eval(auditInPage);
		states.push({ state, ...r });
		if (args.verbose) console.log(`  ${route || 'home'} ${themeName} ${state}: ${r.fails.length}`);
	};
	const steps = async (state) => {
		if (args.quick) return;
		// First, third and last step of every visible step control (a control may start anywhere).
		if ((await page.eval(stepInPage, 'first')) > 0) {
			await page.settle();
			await audit(`${state} · first step`);
		}
		if ((await page.eval(stepInPage, 'next')) > 0) {
			await page.settle();
			await page.eval(stepInPage, 'next');
			await page.settle();
			await audit(`${state} · step 3`);
		}
		if ((await page.eval(stepInPage, 'last')) > 0) {
			await page.settle();
			await audit(`${state} · last step`);
		}
	};

	await page.goto(url);
	for (const l of await page.nestedComplementary()) landmarks.add(l);
	await audit('initial');
	await steps('initial');

	// Tabs and view switches, one at a time, nested ones as they appear.
	const visited = [];
	for (let i = 0; i < 40; i++) {
		const { clicked, seen } = await page.eval(nextViewInPage, visited);
		for (const k of seen) if (!visited.includes(k)) visited.push(k);
		if (!clicked) break;
		visited.push(clicked);
		await page.settle();
		await audit(clicked);
		await steps(clicked);
	}

	// Presets: the open menu, then each preset.
	if (!args.quick) {
		await page.goto(url);
		const { count } = await page.eval(presetInPage, null);
		if (count > 0) {
			await page.settle();
			await audit('preset menu');
			for (let i = 0; i < count; i++) {
				const { label } = await page.eval(presetInPage, i);
				await page.settle();
				await audit(`preset ${label}`);
				if ((await page.eval(stepInPage, 'last')) > 0) {
					await page.settle();
					await audit(`preset ${label} · last step`);
				}
			}
		}
	}

	// The review list: some lines checked.
	if (route === 'midterm') {
		await page.goto(url);
		await page.eval(() => {
			const boxes = [...document.querySelectorAll('main input[type="checkbox"]')].filter(
				(b) => b.getBoundingClientRect().width > 0
			);
			for (const b of boxes.slice(0, 8)) b.click();
			return boxes.length;
		});
		await page.settle();
		await audit('some lines checked');
		await page.eval(() => {
			const all = [...document.querySelectorAll('main input[type="checkbox"]')];
			for (const b of all.slice(0, 40)) if (!b.checked) b.click();
		});
		await page.settle();
		await audit('first lines all checked');
	}
	return { route, theme: themeName, states, landmarks: [...landmarks] };
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

const chromePath =
	args.chrome ??
	process.env.CHROME ??
	[
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium'
	].find((p) => existsSync(p));
if (!chromePath) throw new Error('Chrome not found: pass --chrome <path>');

const profile = mkdtempSync(path.join(tmpdir(), 'contrast-audit-'));
const chrome = spawn(
	chromePath,
	[
		'--headless=new',
		`--remote-debugging-port=${args.port}`,
		`--user-data-dir=${profile}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--hide-scrollbars',
		`--window-size=${args.width},900`,
		'about:blank'
	],
	{ stdio: 'ignore' }
);

async function browserUrl() {
	for (let i = 0; i < 100; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${args.port}/json/version`);
			return (await res.json()).webSocketDebuggerUrl;
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	throw new Error('Chrome did not start');
}

const results = [];
try {
	const conn = await Connection.open(await browserUrl());
	const jobs = themes.flatMap((t) => routes.map((r) => ({ route: r, theme: t })));
	const workers = Array.from({ length: Number(args.concurrency) }, async () => {
		for (let job = jobs.shift(); job; job = jobs.shift()) {
			const page = await Page.open(conn, THEMES[job.theme]);
			try {
				const res = await auditRoute(page, job.route, job.theme);
				results.push(res);
				const fails = new Set(
					res.states.flatMap((s) => s.fails.map((f) => `${f.sel}|${f.text}|${f.fg}|${f.bg}`))
				);
				console.error(
					`${(job.route || 'home').padEnd(16)} ${job.theme.padEnd(12)} ${String(res.states.length).padStart(3)} views  ${String(fails.size).padStart(4)} failing`
				);
			} catch (e) {
				console.error(`${job.route || 'home'} ${job.theme}: ${e.message}`);
				results.push({
					route: job.route,
					theme: job.theme,
					error: e.message,
					states: [],
					landmarks: []
				});
			} finally {
				await page.close().catch(() => {});
			}
		}
	});
	await Promise.all(workers);
	conn.close();
} finally {
	chrome.kill();
	await new Promise((r) => setTimeout(r, 300));
	rmSync(profile, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */

const keyOf = (f) => `${f.sel}|${f.text}|${f.fg}|${f.bg}`;
const summary = {};
const groups = new Map();
const exemptGroups = new Map();
const landmarkIssues = new Map();
for (const res of results) {
	const unique = new Map();
	const uniqueExempt = new Map();
	for (const st of res.states) {
		for (const f of st.fails)
			if (!unique.has(keyOf(f))) unique.set(keyOf(f), { ...f, state: st.state });
		for (const f of st.exempt)
			if (!uniqueExempt.has(keyOf(f))) uniqueExempt.set(keyOf(f), { ...f, state: st.state });
		if (st.theme !== (THEMES[res.theme].saved ?? null))
			console.error(`! ${res.route} ${res.theme}: data-theme is ${st.theme}`);
	}
	const route = res.route || 'home';
	summary[route] ??= {};
	summary[route][res.theme] = {
		views: res.states.length,
		checked: res.states.reduce((n, s) => n + s.checked, 0),
		failing: unique.size,
		exempt: uniqueExempt.size,
		error: res.error
	};
	for (const [map, src] of [
		[groups, unique],
		[exemptGroups, uniqueExempt]
	]) {
		for (const f of src.values()) {
			const k = `${f.reason ? `[${f.reason}] ` : ''}${f.fgToken} on ${f.bgToken}  ·  ${f.sel}`;
			const g = map.get(k) ?? {
				count: 0,
				min: Infinity,
				routes: new Set(),
				themes: new Set(),
				example: f
			};
			g.count++;
			g.min = Math.min(g.min, f.ratio);
			g.routes.add(route);
			g.themes.add(res.theme);
			map.set(k, g);
		}
	}
	for (const l of res.landmarks) {
		const s = landmarkIssues.get(l) ?? new Set();
		s.add(route);
		landmarkIssues.set(l, s);
	}
}

const cols = themes;
console.log(`\nUnique failing text nodes per route and theme (views audited in parentheses)\n`);
console.log('route'.padEnd(16) + cols.map((c) => c.padStart(16)).join(''));
const totals = Object.fromEntries(cols.map((c) => [c, 0]));
for (const route of routes.map((r) => r || 'home')) {
	const row = summary[route] ?? {};
	console.log(
		route.padEnd(16) +
			cols
				.map((c) => {
					const s = row[c];
					if (!s) return '-'.padStart(16);
					totals[c] += s.failing;
					return (s.error ? 'ERR' : `${s.failing} (${s.views})`).padStart(16);
				})
				.join('')
	);
}
console.log('total'.padEnd(16) + cols.map((c) => String(totals[c]).padStart(16)).join(''));

const printGroups = (title, map) => {
	if (!map.size) return;
	console.log(`\n${title}\n`);
	for (const [k, g] of [...map].sort((a, b) => b[1].count - a[1].count)) {
		const e = g.example;
		console.log(
			`${String(g.count).padStart(4)}  min ${g.min.toFixed(2)} (need ${e.need})  ${k}\n      e.g. "${e.text}" ${e.fg} on ${e.bg}, ${e.size}px/${e.weight}${e.hidden ? ', aria-hidden' : ''}${e.opacity < 1 ? `, opacity ${e.opacity}` : ''}${e.bgImage ? `, background image on ${e.bgImage}` : ''} [${[...g.themes].join(' ')}] [${[...g.routes].slice(0, 6).join(' ')}${g.routes.size > 6 ? ' …' : ''}] at "${e.state}"`
		);
	}
};
printGroups('Failures by color pair and element', groups);
printGroups('Listed apart (disabled controls; faint placeholders under 20% opacity)', exemptGroups);
if (landmarkIssues.size) {
	console.log('\nComplementary landmarks inside another landmark\n');
	for (const [l, r] of landmarkIssues) console.log(`  ${l}  [${[...r].join(' ')}]`);
}

if (args.json) {
	writeFileSync(args.json, JSON.stringify({ summary, results }, null, 1));
	console.log(`\nDetails: ${args.json}`);
}

// Exit with 1 when any text fails, or a route could not be audited.
if (Object.values(totals).some((n) => n > 0) || results.some((r) => r.error)) process.exitCode = 1;
