<!--
@component
State diagram of an automaton (docs/ARCHITECTURE.md §3.5, §5.2): automatic
left-to-right layout or pinned positions, pan and zoom, simulation highlights,
group outlines, and (with `editable`) a small editor. Edits never mutate the
props; they are reported through `onchange` as a new automaton plus positions.

Passing a different machine (one this view did not just report through
`onchange`) refits the view and drops local edits in progress; with `viewKey`
set, only a change of `viewKey` refits. `fit()` refits on demand.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Automaton, Point, Positions, State, StateId } from '$lib/theory/automata/types';
	import type { NamedSet } from '$lib/theory/chars';
	import { arrowHeadD, ellipseBoundary, pathToD, lineCubic, type Box } from './geometry';
	import {
		edgeKey,
		layoutAutomaton,
		layoutKey,
		nodeAt,
		nodePositions,
		type EdgeGeometry,
		type NodeGeometry
	} from './layout';
	import { groupShapes } from './groups';
	import {
		boxesIntersect,
		clampZoom,
		fitView,
		panView,
		toUser,
		toViewport,
		unionBox,
		viewScale,
		zoomView,
		FIT_MAX_SCALE,
		type ViewBox
	} from './camera';
	import {
		addState,
		edgeSymbols,
		edgeTransitions,
		removeEdge,
		removeStates,
		remapPositions,
		setEdgeLabel,
		setStart,
		updateState,
		withPosition
	} from './edit';
	import { labelText, parseLabelText } from './label-text';
	import type { AutomatonGroup, AutomatonHighlight, GraphSelection, StateTone } from './types';

	interface Props {
		automaton: Automaton;
		/** Pinned state centers; omit for automatic left-to-right layout. */
		positions?: Positions;
		highlight?: AutomatonHighlight;
		groups?: readonly AutomatonGroup[];
		/** Named sets shown by name in edge labels (e.g. digit). */
		names?: readonly NamedSet[];
		/** Turns on the editor; handle `onchange` to keep the result. */
		editable?: boolean;
		selected?: GraphSelection;
		onchange?: (automaton: Automaton, positions: Positions) => void;
		onstateclick?: (id: StateId) => void;
		ontransitionclick?: (transitionIds: number[], key: string) => void;
		/** Height in px, or 'auto' to follow the drawing's aspect ratio. */
		height?: number | 'auto';
		ariaLabel?: string;
		/** Text above the start arrow, e.g. 'start'. */
		startLabel?: string;
		/**
		 * When set, the view refits only when this value changes (e.g. a preset id),
		 * so a stepper can swap machines without losing the user's zoom.
		 */
		viewKey?: unknown;
		/**
		 * An area (layout units) that "fit" always shows, e.g. the bounds of the
		 * finished machine while a construction grows with pinned positions, so the
		 * drawing does not shift as states appear.
		 */
		frame?: Box;
	}

	let {
		automaton,
		positions,
		highlight,
		groups,
		names,
		editable = false,
		selected = $bindable(null),
		onchange,
		onstateclick,
		ontransitionclick,
		height = 320,
		ariaLabel,
		startLabel,
		viewKey,
		frame
	}: Props = $props();

	const PAD = 18;
	const ZOOM_STEP = 1.3;

	/** What this view last reported through `onchange`. */
	let emitted: { automaton: Automaton; key: string; positions: Positions } | null = null;
	/** Whether a machine is (or draws exactly like) the one this view last reported. */
	const echoes = (a: Automaton) =>
		emitted !== null && (a === emitted.automaton || layoutKey(a) === emitted.key);

	// Local copies that follow the props but also take the user's edits at once.
	let current = $derived(automaton);
	let seenPositions: { value: Positions | undefined } | null = null;
	let pinned = $derived.by(() => {
		const a = automaton;
		const p = positions;
		const kept = seenPositions !== null && seenPositions.value === p;
		seenPositions = { value: p };
		// Only the machine that follows an edit can echo it.
		if (emitted && !echoes(a)) emitted = null;
		// New positions from the parent win. A parent that echoes an edit back
		// without its positions keeps the ones the edit was made with; any other
		// machine drops them.
		return kept && emitted ? emitted.positions : p;
	});

	const layout = $derived(layoutAutomaton(current, { positions: pinned, names, startLabel }));
	const shapes = $derived(groups && groups.length > 0 ? groupShapes(layout, groups) : []);
	const content = $derived(
		unionBox([layout.bounds, ...shapes.map((s) => s.bounds), ...(frame ? [frame] : [])])
	);

	// ------------------------------------------------------------------
	// Camera
	// ------------------------------------------------------------------

	let vpWidth = $state(0);
	let vpHeight = $state(0);
	const hasViewport = $derived(vpWidth > 0 && vpHeight > 0);
	const fitted = $derived(
		fitView(content, PAD, hasViewport ? { width: vpWidth, height: vpHeight } : undefined)
	);
	/** User-chosen view; null follows "fit". */
	let camera = $state<ViewBox | null>(null);
	const view = $derived(camera && boxesIntersect(camera, content) ? camera : fitted);
	const zoomed = $derived(camera !== null && Math.abs(fitted.width / view.width - 1) > 0.02);

	const sizeStyle = $derived.by(() => {
		if (height !== 'auto') return `height: ${height}px`;
		const w = content.width + 2 * PAD;
		const h = content.height + 2 * PAD;
		if (vpWidth <= 0)
			return `aspect-ratio: ${Math.max(w, 1)} / ${Math.max(h, 1)}; max-height: 560px`;
		const s = Math.min(vpWidth / w, FIT_MAX_SCALE);
		return `height: ${Math.round(Math.min(Math.max(h * s, 140), 560))}px`;
	});

	function viewport(): { width: number; height: number } {
		const r = svgEl?.getBoundingClientRect();
		return r ? { width: r.width, height: r.height } : { width: vpWidth, height: vpHeight };
	}

	function userPoint(e: { clientX: number; clientY: number }): Point {
		const r = svgEl!.getBoundingClientRect();
		return toUser(view, viewport(), { x: e.clientX - r.left, y: e.clientY - r.top });
	}

	function zoomAt(factor: number, about?: Point) {
		const v = view;
		const c = about ?? { x: v.x + v.width / 2, y: v.y + v.height / 2 };
		camera = clampZoom(zoomView(v, factor, c), fitted);
	}

	/** Shows the whole drawing again (what the "Fit" button does). */
	export function fit() {
		camera = null;
	}

	// A different machine drops anything half-done (a drag, a label being typed)
	// and, unless viewKey decides, refits with nothing selected. An echo of this
	// view's own edit keeps everything as it is.
	let seenView: { automaton: Automaton; viewKey: unknown } | null = null;
	$effect.pre(() => {
		const a = automaton;
		const k = viewKey;
		untrack(() => {
			const prev = seenView;
			seenView = { automaton: a, viewKey: k };
			if (!prev) return;
			const foreign = a !== prev.automaton && !echoes(a);
			const refit = k !== undefined || prev.viewKey !== undefined ? k !== prev.viewKey : foreign;
			if (foreign) {
				emitted = null;
				cancelDrag(false);
				linkFrom = null;
				editor = null;
			}
			if (refit) {
				camera = null;
				if (selected !== null) selected = null;
			}
		});
	});

	// ------------------------------------------------------------------
	// Highlight state
	// ------------------------------------------------------------------

	function toSet<T>(items: Iterable<T> | undefined): Set<T> {
		return new Set(items ?? []);
	}
	const activeSet = $derived(toSet(highlight?.active));
	const takenSet = $derived(toSet(highlight?.taken));
	const dimSet = $derived(toSet(highlight?.dim));
	const dimTransitionSet = $derived(toSet(highlight?.dimTransitions));

	function toneOf(id: StateId): StateTone | undefined {
		const t = highlight?.tone;
		if (!t) return undefined;
		if (t instanceof Map) return t.get(id);
		return (t as Readonly<Record<number, StateTone>>)[id];
	}

	function edgeLook(e: EdgeGeometry) {
		const taken = e.transitionIds.some((id) => takenSet.has(id));
		const dim =
			!taken &&
			(dimSet.has(e.from) ||
				dimSet.has(e.to) ||
				(e.transitionIds.length > 0 && e.transitionIds.every((id) => dimTransitionSet.has(id))));
		const dead = !!(current.states[e.from]?.trap || current.states[e.to]?.trap);
		return { taken, dim, dead };
	}

	const nameOf = (s: State | undefined) => (s ? s.name || `#${s.id}` : '');

	function stateAria(s: State): string {
		const parts = [`State ${nameOf(s)}`];
		if (s.id === current.start) parts.push('start');
		if (s.accepting) parts.push('accepting');
		if (s.trap) parts.push('trap');
		if (activeSet.has(s.id)) parts.push('current');
		const tone = toneOf(s.id);
		if (tone === 'accept') parts.push('accepted');
		if (tone === 'reject') parts.push('rejected');
		if (s.note) parts.push(s.note);
		return parts.join(', ');
	}

	const edgeAria = (e: EdgeGeometry) =>
		`Transition from ${nameOf(current.states[e.from])} to ${nameOf(current.states[e.to])} on ${e.label}`;

	const summary = $derived.by(() => {
		const n = current.states.length;
		const m = current.transitions.length;
		const start = current.states[current.start];
		const accepting = current.states.filter((s) => s.accepting).map(nameOf);
		return [
			`State diagram with ${n} state${n === 1 ? '' : 's'} and ${m} transition${m === 1 ? '' : 's'}.`,
			start ? `Start state ${nameOf(start)}.` : '',
			accepting.length ? `Accepting: ${accepting.join(', ')}.` : 'No accepting states.'
		]
			.filter(Boolean)
			.join(' ');
	});

	const stateInteractive = $derived(editable || !!onstateclick);
	const edgeInteractive = $derived(editable || !!ontransitionclick);
	const interactive = $derived(stateInteractive || edgeInteractive);

	// ------------------------------------------------------------------
	// Selection and editing
	// ------------------------------------------------------------------

	const selectedState = $derived(
		selected?.kind === 'state' && current.states[selected.id] ? selected.id : null
	);
	const selectedEdge = $derived.by(() => {
		const sel = selected;
		return sel?.kind === 'edge' ? (layout.edges.find((e) => e.key === sel.key) ?? null) : null;
	});

	type Editor =
		| {
				kind: 'label';
				from: StateId;
				to: StateId;
				/** ε-ness of the edge being edited, or null for a new edge. */
				epsilon: boolean | null;
				text: string;
				initial: string;
				error: string | null;
				anchor: Point;
		  }
		| {
				kind: 'name';
				id: StateId;
				text: string;
				initial: string;
				error: string | null;
				anchor: Point;
		  };
	let editor = $state<Editor | null>(null);
	/** Source of a transition being added by tapping (the + handle, or keyboard). */
	let linkFrom = $state<StateId | null>(null);

	const currentPositions = (): Positions => nodePositions(layout);

	function emit(next: Automaton, pos: Positions = currentPositions()) {
		// Freeze the camera so the drawing does not jump while it is edited.
		camera = view;
		current = next;
		pinned = pos;
		emitted = { automaton: next, key: layoutKey(next), positions: pos };
		onchange?.(next, pos);
	}

	/** Snap a dragged state onto the row or column of a nearby state. */
	function snap(id: StateId, p: Point): Point {
		let { x, y } = p;
		let bx = 7;
		let by = 7;
		for (const n of layout.nodes.values()) {
			if (n.id === id) continue;
			if (Math.abs(n.x - p.x) < bx) {
				bx = Math.abs(n.x - p.x);
				x = n.x;
			}
			if (Math.abs(n.y - p.y) < by) {
				by = Math.abs(n.y - p.y);
				y = n.y;
			}
		}
		return { x: Math.round(x), y: Math.round(y) };
	}

	function addStateAt(p: Point) {
		const { automaton: next, id } = addState(current);
		const pos = currentPositions();
		pos.set(id, snap(-1, p));
		emit(next, pos);
		selected = { kind: 'state', id };
	}

	/** Adds a state in free space near the middle of the view. */
	function addStateInView() {
		const c = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
		const free = (p: Point) =>
			[...layout.nodes.values()].every((n) => Math.hypot(n.x - p.x, n.y - p.y) > 70);
		let p = c;
		for (let k = 0; k < 40 && !free(p); k++) {
			const ang = k * 2.4;
			const r = 40 + k * 14;
			p = { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) };
		}
		addStateAt(p);
		focusState(current.states.length - 1);
	}

	function deleteSelection() {
		if (!editable) return;
		if (selectedState !== null) {
			const { automaton: next, map } = removeStates(current, [selectedState]);
			emit(next, remapPositions(currentPositions(), map));
		} else if (selectedEdge) {
			emit(removeEdge(current, selectedEdge.key));
		} else return;
		selected = null;
		svgEl?.focus();
	}

	function toggleAccepting(id: StateId) {
		const s = current.states[id];
		if (s) emit(updateState(current, id, { accepting: !s.accepting }));
	}

	function makeStart(id: StateId) {
		emit(setStart(current, id));
	}

	function edgeText(e: EdgeGeometry): string {
		const ts = edgeTransitions(current, e.key);
		if (e.epsilon) return 'ε';
		if (ts.some((t) => t.display)) return e.label;
		return labelText(edgeSymbols(ts), { names });
	}

	function openLabelEditor(from: StateId, to: StateId, epsilon?: boolean) {
		const existing =
			epsilon !== undefined
				? layout.edges.find((e) => e.key === edgeKey(from, to, epsilon))
				: (layout.edges.find((e) => e.key === edgeKey(from, to, false)) ??
					layout.edges.find((e) => e.key === edgeKey(from, to, true)));
		camera = view;
		if (existing) {
			const text = edgeText(existing);
			selected = { kind: 'edge', key: existing.key };
			editor = {
				kind: 'label',
				from,
				to,
				epsilon: existing.epsilon,
				text,
				initial: text,
				error: null,
				anchor: existing.labelPos
			};
			return;
		}
		const a = layout.nodes.get(from)!;
		const b = layout.nodes.get(to)!;
		// Beside the middle of the new edge, on its upper side, clear of both states.
		let anchor = { x: a.x, y: a.y - a.outerRy - 48 };
		if (from !== to) {
			const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
			let nx = (b.y - a.y) / d;
			let ny = -(b.x - a.x) / d;
			if (ny > 0 || (ny === 0 && nx < 0)) {
				nx = -nx;
				ny = -ny;
			}
			anchor = { x: (a.x + b.x) / 2 + nx * 30, y: (a.y + b.y) / 2 + ny * 30 };
		}
		editor = { kind: 'label', from, to, epsilon: null, text: '', initial: '', error: null, anchor };
	}

	function openNameEditor(id: StateId) {
		const n = layout.nodes.get(id);
		const s = current.states[id];
		if (!n || !s) return;
		camera = view;
		editor = {
			kind: 'name',
			id,
			text: s.name,
			initial: s.name,
			error: null,
			anchor: { x: n.x, y: n.y }
		};
	}

	/** Applies the open editor; returns false (and shows why) when the text is invalid. */
	function commitEditor(): boolean {
		const ed = editor;
		if (!ed) return true;
		if (ed.kind === 'name') {
			const name = ed.text.trim();
			if (name !== ed.initial) {
				const clash = current.states.find((s) => s.id !== ed.id && s.name === name && name !== '');
				if (clash) {
					ed.error = `Another state is already named ${name}.`;
					return false;
				}
				emit(updateState(current, ed.id, { name }));
			}
			closeEditor({ kind: 'state', id: ed.id });
			return true;
		}
		if (ed.epsilon !== null && ed.text.trim() === ed.initial.trim()) {
			closeEditor({ kind: 'edge', key: edgeKey(ed.from, ed.to, ed.epsilon) });
			return true;
		}
		const r = parseLabelText(ed.text, { names });
		if (!r.ok) {
			ed.error = r.diagnostic.message;
			return false;
		}
		const { symbols, epsilon } = r.label;
		if (symbols.isEmpty && !epsilon) {
			if (ed.epsilon !== null) {
				emit(removeEdge(current, edgeKey(ed.from, ed.to, ed.epsilon)));
				selected = null;
			}
			closeEditor(null);
			return true;
		}
		const replace = ed.epsilon === null ? undefined : { epsilon: ed.epsilon };
		emit(setEdgeLabel(current, ed.from, ed.to, r.label, replace));
		const key = edgeKey(ed.from, ed.to, symbols.isEmpty);
		selected = { kind: 'edge', key };
		closeEditor({ kind: 'edge', key });
		return true;
	}

	function closeEditor(focusOn: GraphSelection) {
		editor = null;
		// Return focus to the drawing so keyboard shortcuts keep working, unless the
		// user already moved it somewhere else.
		tick().then(() => {
			const active = document.activeElement;
			if (active && active !== document.body) return;
			if (focusOn?.kind === 'state') focusState(focusOn.id);
			else if (focusOn?.kind === 'edge')
				svgEl
					?.querySelector<SVGElement>(
						`[data-edge-label][data-edge="${CSS.escape(focusOn.key)}"] [role='button']`
					)
					?.focus();
			else svgEl?.focus();
		});
	}

	function focusState(id: StateId) {
		tick().then(() =>
			svgEl?.querySelector<SVGElement>(`[data-state="${id}"] [role='button']`)?.focus()
		);
	}

	function onEditorKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEditor();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			const ed = editor;
			closeEditor(
				ed?.kind === 'name'
					? { kind: 'state', id: ed.id }
					: ed && ed.epsilon !== null
						? { kind: 'edge', key: edgeKey(ed.from, ed.to, ed.epsilon) }
						: null
			);
		}
	}

	function onEditorBlur() {
		// Leaving the field applies valid text and drops anything else.
		if (!editor) return;
		const ed = editor;
		if (ed.kind === 'label' && ed.text.trim() === '' && ed.epsilon !== null) {
			editor = null;
			return;
		}
		if (!commitEditor()) editor = null;
	}

	function autofocus(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

	function insertEpsilon() {
		if (editor?.kind !== 'label') return;
		const t = editor.text.trim();
		editor.text = t === '' ? 'ε' : `${t},ε`;
		editor.error = null;
	}

	// ------------------------------------------------------------------
	// Pointer and keyboard interaction
	// ------------------------------------------------------------------

	type Target =
		| { kind: 'background' }
		| { kind: 'handle' }
		| { kind: 'state'; id: StateId }
		| { kind: 'edge'; key: string; label: boolean };

	type Drag =
		| { kind: 'pan'; id: number; start: Point; last: Point; moved: boolean; target: Target }
		| {
				kind: 'move';
				id: number;
				state: StateId;
				grab: Point;
				start: Point;
				moved: boolean;
				/** Every state's position when the drag began. */
				base: Positions;
				/** The pinned positions then (undefined for automatic layout), restored on Escape. */
				before: Positions | undefined;
		  }
		| {
				kind: 'link';
				id: number;
				from: StateId;
				at: Point;
				to: StateId | null;
				start: Point;
				moved: boolean;
				left: boolean;
		  };

	let svgEl = $state<SVGSVGElement>();
	let drag = $state<Drag | null>(null);
	// Active pointers by id (plain bookkeeping for pinch gestures, not rendered).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, Point>();
	let pinch: { dist: number; mid: Point } | null = null;
	let lastTap: { time: number; x: number; y: number; key: string } | null = null;
	let engaged = false;

	function targetOf(el: EventTarget | null): Target {
		const t = el instanceof Element ? el : null;
		if (!t) return { kind: 'background' };
		if (t.closest('[data-handle]')) return { kind: 'handle' };
		const s = t.closest<SVGElement>('[data-state]');
		if (s) return { kind: 'state', id: Number(s.dataset.state) };
		const e = t.closest<SVGElement>('[data-edge]');
		if (e) return { kind: 'edge', key: e.dataset.edge!, label: e.hasAttribute('data-edge-label') };
		return { kind: 'background' };
	}

	function activateState(id: StateId, double = false) {
		if (linkFrom !== null) {
			const from = linkFrom;
			linkFrom = null;
			openLabelEditor(from, id);
			return;
		}
		if (editable) {
			if (double) toggleAccepting(id);
			selected = { kind: 'state', id };
		}
		onstateclick?.(id);
	}

	function activateEdge(key: string, onLabel: boolean) {
		const e = layout.edges.find((x) => x.key === key);
		if (!e) return;
		if (linkFrom !== null) linkFrom = null;
		if (editable) {
			selected = { kind: 'edge', key };
			if (onLabel) openLabelEditor(e.from, e.to, e.epsilon);
		}
		ontransitionclick?.(e.transitionIds, key);
	}

	function tap(target: Target, e: PointerEvent) {
		const now = performance.now();
		const key =
			target.kind === 'state' ? `s${target.id}` : target.kind === 'edge' ? `e${target.key}` : 'bg';
		const double =
			lastTap !== null &&
			now - lastTap.time < 360 &&
			lastTap.key === key &&
			Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14;
		lastTap = double ? null : { time: now, x: e.clientX, y: e.clientY, key };
		if (target.kind === 'state') activateState(target.id, double);
		else if (target.kind === 'edge') activateEdge(target.key, target.label);
		else if (target.kind === 'background') {
			if (linkFrom !== null) linkFrom = null;
			else if (editable && double) addStateAt(userPoint(e));
			else if (editable) selected = null;
		}
	}

	function startPinch() {
		const [a, b] = [...pointers.values()];
		pinch = {
			dist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
			mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
		};
		camera = view;
	}

	function updatePinch() {
		if (!pinch || !svgEl) return;
		const [a, b] = [...pointers.values()];
		const dist = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
		const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		const r = svgEl.getBoundingClientRect();
		const vp = { width: r.width, height: r.height };
		let v = view;
		const s = viewScale(v, vp);
		v = panView(v, (mid.x - pinch.mid.x) / s, (mid.y - pinch.mid.y) / s);
		v = zoomView(v, dist / pinch.dist, toUser(v, vp, { x: mid.x - r.left, y: mid.y - r.top }));
		camera = clampZoom(v, fitted);
		pinch = { dist, mid };
	}

	function finishMove(d: Drag) {
		if (d.kind === 'move' && d.moved && pinned) emit(current, pinned);
	}

	/** Abandons a drag (a moved state goes back unless `restore` is false); the pointer no longer counts. */
	function cancelDrag(restore = true) {
		const d = drag;
		if (!d) return;
		drag = null;
		if (restore && d.kind === 'move' && d.moved) pinned = d.before;
		pointers.delete(d.id);
		pinch = null;
		try {
			svgEl?.releasePointerCapture(d.id);
		} catch {
			/* capture is best-effort */
		}
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		if (editor && !(e.target instanceof Element && e.target.closest('[data-editor]'))) {
			if (!commitEditor()) editor = null;
		}
		engaged = true;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		try {
			svgEl?.setPointerCapture(e.pointerId);
		} catch {
			/* capture is best-effort */
		}
		if (pointers.size === 2) {
			if (drag) finishMove(drag);
			drag = null;
			startPinch();
			return;
		}
		if (pointers.size > 2) return;
		const target = targetOf(e.target);
		const start = { x: e.clientX, y: e.clientY };
		const at = userPoint(e);
		if (
			editable &&
			((target.kind === 'handle' && selectedState !== null) ||
				(target.kind === 'state' && e.shiftKey))
		) {
			const from = target.kind === 'state' ? target.id : selectedState!;
			drag = {
				kind: 'link',
				id: e.pointerId,
				from,
				at,
				to: null,
				start,
				moved: false,
				left: false
			};
			e.preventDefault();
			return;
		}
		if (editable && target.kind === 'state') {
			const n = layout.nodes.get(target.id)!;
			drag = {
				kind: 'move',
				id: e.pointerId,
				state: target.id,
				grab: { x: at.x - n.x, y: at.y - n.y },
				start,
				moved: false,
				base: currentPositions(),
				before: pinned
			};
			return;
		}
		drag = { kind: 'pan', id: e.pointerId, start, last: start, moved: false, target };
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinch && pointers.size >= 2) {
			updatePinch();
			return;
		}
		const d = drag;
		if (!d || d.id !== e.pointerId) return;
		const far =
			Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) >
			(e.pointerType === 'touch' ? 8 : 4);
		if (!d.moved && !far) return;
		if (d.kind === 'pan') {
			d.moved = true;
			const s = viewScale(view, viewport());
			camera = panView(view, (e.clientX - d.last.x) / s, (e.clientY - d.last.y) / s);
			d.last = { x: e.clientX, y: e.clientY };
		} else if (d.kind === 'move') {
			if (!d.moved) {
				camera = view;
				selected = { kind: 'state', id: d.state };
			}
			d.moved = true;
			const at = userPoint(e);
			pinned = withPosition(
				d.base,
				d.state,
				snap(d.state, { x: at.x - d.grab.x, y: at.y - d.grab.y })
			);
		} else {
			d.moved = true;
			d.at = userPoint(e);
			const over = nodeAt(layout, d.at, 6);
			if (over !== d.from) d.left = true;
			d.to = over === d.from && !d.left ? null : over;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.delete(e.pointerId);
		if (pinch) {
			if (pointers.size < 2) pinch = null;
			drag = null;
			return;
		}
		const d = drag;
		if (!d || d.id !== e.pointerId) return;
		drag = null;
		if (d.kind === 'pan') {
			if (!d.moved) tap(d.target, e);
		} else if (d.kind === 'move') {
			if (d.moved) finishMove(d);
			else tap({ kind: 'state', id: d.state }, e);
		} else if (d.moved) {
			if (d.to !== null) openLabelEditor(d.from, d.to);
		} else linkFrom = d.from;
	}

	function onPointerCancel(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinch = null;
		if (drag && drag.id === e.pointerId) {
			finishMove(drag);
			drag = null;
		}
	}

	function onWheel(e: WheelEvent) {
		if (!(e.ctrlKey || e.metaKey || engaged)) return;
		e.preventDefault();
		const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
		// Trackpad pinches arrive as small ctrl+wheel deltas; mouse notches are ~100.
		const raw = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.002));
		zoomAt(Math.min(Math.max(raw, 0.8), 1.25), userPoint(e));
	}

	function onKeyDown(e: KeyboardEvent) {
		const t = e.target;
		if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
		const target = targetOf(t);
		switch (e.key) {
			case 'Escape':
				if (linkFrom !== null) linkFrom = null;
				else if (drag) cancelDrag();
				else if (selected && editable) selected = null;
				else return;
				break;
			case 'Delete':
			case 'Backspace':
				if (!editable || (selectedState === null && !selectedEdge)) return;
				deleteSelection();
				break;
			case '+':
			case '=':
				zoomAt(ZOOM_STEP);
				break;
			case '-':
			case '_':
				zoomAt(1 / ZOOM_STEP);
				break;
			case '0':
				fit();
				break;
			case 'Enter':
			case ' ':
				if (target.kind === 'state') activateState(target.id);
				else if (target.kind === 'edge') activateEdge(target.key, true);
				else if (target.kind === 'handle' && selectedState !== null) linkFrom = selectedState;
				else return;
				break;
			case 'ArrowLeft':
			case 'ArrowRight':
			case 'ArrowUp':
			case 'ArrowDown': {
				const step = e.shiftKey ? 32 : 8;
				const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
				const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
				if (editable && target.kind === 'state' && selectedState === target.id) {
					const pos = currentPositions();
					const p = pos.get(target.id)!;
					pos.set(target.id, { x: p.x + dx, y: p.y + dy });
					emit(current, pos);
				} else if (t instanceof Element && (svgEl?.contains(t) || t.closest('[data-zoombar]'))) {
					// Pans from anywhere in the drawing or the zoom buttons.
					const s = viewScale(view, viewport());
					camera = panView(view, (-dx * 3) / s, (-dy * 3) / s);
				} else return;
				break;
			}
			default:
				return;
		}
		e.preventDefault();
	}

	$effect(() => {
		const el = svgEl;
		if (!el) return;
		const leave = () => (engaged = false);
		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerCancel);
		el.addEventListener('pointerleave', leave);
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerCancel);
			el.removeEventListener('pointerleave', leave);
			el.removeEventListener('wheel', onWheel);
		};
	});

	let rootEl = $state<HTMLDivElement>();
	$effect(() => {
		const el = rootEl;
		if (!el) return;
		el.addEventListener('keydown', onKeyDown);
		return () => el.removeEventListener('keydown', onKeyDown);
	});

	// Drop a link in progress when editing is turned off.
	$effect(() => {
		if (!editable) {
			linkFrom = null;
			editor = null;
		}
	});

	// ------------------------------------------------------------------
	// Derived drawing bits
	// ------------------------------------------------------------------

	const handleAt = $derived.by(() => {
		if (!editable || selectedState === null || editor || drag?.kind === 'move') return null;
		const n = layout.nodes.get(selectedState);
		if (!n) return null;
		const k = Math.SQRT1_2;
		return { x: n.x + (n.outerRx + 10) * k, y: n.y - (n.outerRy + 10) * k };
	});

	/** Dashed preview for a transition being drawn (or waiting for its label). */
	const preview = $derived.by((): { d: string; head: string } | null => {
		let from: StateId;
		let to: StateId | null;
		let at: Point | null = null;
		if (drag?.kind === 'link' && drag.moved) {
			from = drag.from;
			to = drag.to;
			at = drag.at;
		} else if (editor?.kind === 'label' && editor.epsilon === null) {
			from = editor.from;
			to = editor.to;
		} else return null;
		const a = layout.nodes.get(from);
		if (!a) return null;
		if (to === from) {
			const top = a.y - a.outerRy;
			const d = `M${a.x + 10} ${top + 3}C${a.x + 30} ${top - 38} ${a.x - 30} ${top - 38} ${a.x - 10} ${top + 3}`;
			return { d, head: arrowHeadD({ x: a.x - 10, y: top + 3 }, Math.atan2(40, 20)) };
		}
		const b = to !== null ? layout.nodes.get(to) : undefined;
		const end = b ? { x: b.x, y: b.y } : at;
		if (!end) return null;
		const outerA = { x: a.x, y: a.y, rx: a.outerRx, ry: a.outerRy };
		const p = ellipseBoundary(outerA, end);
		const q = b ? ellipseBoundary({ x: b.x, y: b.y, rx: b.outerRx, ry: b.outerRy }, a) : end;
		const angle = Math.atan2(q.y - p.y, q.x - p.x);
		return { d: pathToD([lineCubic(p, q)]), head: arrowHeadD(q, angle) };
	});

	const editorStyle = $derived.by(() => {
		if (!editor) return '';
		const p = toViewport(view, { width: vpWidth, height: vpHeight }, editor.anchor);
		const x = Math.min(Math.max(p.x, 70), Math.max(vpWidth - 70, 70));
		const y = Math.min(Math.max(p.y, 22), Math.max(vpHeight - 22, 22));
		return `left: ${x}px; top: ${y}px`;
	});

	const nodeClass = (n: NodeGeometry) => (n.shape === 'ellipse' ? 'ellipse' : 'circle');
	const viewBoxAttr = (v: Box) => `${v.x} ${v.y} ${v.width} ${v.height}`;
</script>

{#snippet labelBody(e: EdgeGeometry)}
	<rect
		x={e.labelPos.x - e.labelSize.width / 2 - 3}
		y={e.labelPos.y - e.labelSize.height / 2 - 1}
		width={e.labelSize.width + 6}
		height={e.labelSize.height + 2}
		rx="4"
	/>
	<text x={e.labelPos.x} y={e.labelPos.y}>{e.label}</text>
{/snippet}

{#snippet stateBody(s: State, n: NodeGeometry)}
	<ellipse class="focus" cx={n.x} cy={n.y} rx={n.outerRx + 5} ry={n.outerRy + 5} />
	{#if s.accepting}
		<ellipse class="ring" cx={n.x} cy={n.y} rx={n.outerRx} ry={n.outerRy} />
	{/if}
	<ellipse class="shape" cx={n.x} cy={n.y} rx={n.rx} ry={n.ry} />
	{#if s.name}
		<text class="name" x={n.x} y={n.y}>{s.name}</text>
	{/if}
	{#if n.retract}
		<text class="retract" x={n.retract.x} y={n.retract.y}>*</text>
	{/if}
	{#if n.note}
		<text class="note" x={n.note.x} y={n.note.y} text-anchor={n.note.anchor}>{n.note.text}</text>
	{/if}
{/snippet}

<div class="automaton-view" class:editable bind:this={rootEl}>
	<div class="canvas" style={sizeStyle} bind:clientWidth={vpWidth} bind:clientHeight={vpHeight}>
		<svg
			bind:this={svgEl}
			class="drawing"
			class:panning={drag?.kind === 'pan' && drag.moved}
			class:linking={linkFrom !== null || drag?.kind === 'link'}
			viewBox={viewBoxAttr(view)}
			preserveAspectRatio="xMidYMid meet"
			role={interactive ? 'group' : 'img'}
			aria-label={ariaLabel ?? summary}
			aria-roledescription="state diagram"
			tabindex="-1"
		>
			{#if shapes.length > 0}
				<g class="groups" aria-hidden="true">
					{#each shapes as g (g.id)}
						<g class="group t{g.tone} {g.kind}">
							<path d={g.d} />
							{#if g.label}
								<text
									class="group-label"
									x={g.labelPos.x}
									y={g.labelPos.y}
									text-anchor={g.labelAnchor}>{g.label}</text
								>
							{/if}
						</g>
					{/each}
				</g>
			{/if}

			<g class="edges" aria-hidden="true">
				{#each layout.edges as e (e.key)}
					{@const look = edgeLook(e)}
					<g
						class="edge"
						class:eps={e.epsilon}
						class:taken={look.taken}
						class:dim={look.dim}
						class:dead={look.dead}
						class:selected={selectedEdge?.key === e.key}
						class:interactive={edgeInteractive}
						data-edge={e.key}
					>
						<path class="hit" d={e.path} />
						<path class="line" d={e.path} />
						<path
							class="head"
							d={look.taken
								? arrowHeadD(e.arrowTip, e.arrowAngle, 11, 4.4)
								: arrowHeadD(e.arrowTip, e.arrowAngle)}
						/>
					</g>
				{/each}
			</g>

			{#if layout.start}
				<g class="start" aria-hidden="true">
					<path class="line" d={layout.start.path} />
					<path class="head" d={arrowHeadD(layout.start.arrowTip, layout.start.arrowAngle)} />
					{#if layout.start.label}
						<text class="start-label" x={layout.start.label.x} y={layout.start.label.y}
							>{layout.start.label.text}</text
						>
					{/if}
				</g>
			{/if}

			<!-- Each state, then the labels of its outgoing edges: the tab order. -->
			<g class="items">
				{#each current.states as s (s.id)}
					{@const n = layout.nodes.get(s.id)}
					{#if n}
						{@const tone = toneOf(s.id)}
						<g
							class="state {nodeClass(n)}"
							class:accepting={s.accepting}
							class:trap={s.trap}
							class:active={activeSet.has(s.id)}
							class:dim={dimSet.has(s.id)}
							class:tone-accept={tone === 'accept'}
							class:tone-reject={tone === 'reject'}
							class:tone-info={tone === 'info'}
							class:selected={selectedState === s.id}
							class:link-source={linkFrom === s.id || (drag?.kind === 'link' && drag.from === s.id)}
							class:link-target={drag?.kind === 'link' && drag.to === s.id}
							class:interactive={stateInteractive}
							data-state={s.id}
							aria-hidden={stateInteractive ? undefined : 'true'}
						>
							{#if stateInteractive}
								<g class="button" role="button" tabindex="0" aria-label={stateAria(s)}>
									{@render stateBody(s, n)}
								</g>
							{:else}
								{@render stateBody(s, n)}
							{/if}
						</g>
					{/if}
					{#each layout.edges.filter((e) => e.from === s.id) as e (e.key)}
						{@const look = edgeLook(e)}
						<g
							class="label"
							class:eps={e.epsilon}
							class:taken={look.taken}
							class:dim={look.dim}
							class:dead={look.dead}
							class:selected={selectedEdge?.key === e.key}
							class:interactive={edgeInteractive}
							data-edge={e.key}
							data-edge-label=""
							aria-hidden={edgeInteractive ? undefined : 'true'}
						>
							{#if edgeInteractive}
								<g class="button" role="button" tabindex="0" aria-label={edgeAria(e)}>
									{@render labelBody(e)}
								</g>
							{:else}
								{@render labelBody(e)}
							{/if}
						</g>
					{/each}
				{/each}
			</g>

			{#if preview}
				<g class="preview" aria-hidden="true">
					<path class="line" d={preview.d} />
					<path class="head" d={preview.head} />
				</g>
			{/if}

			{#if handleAt && selectedState !== null}
				<g
					class="handle"
					data-handle=""
					role="button"
					tabindex="0"
					aria-label="Add a transition from {nameOf(current.states[selectedState])}"
					transform="translate({handleAt.x} {handleAt.y})"
				>
					<circle r="12" class="handle-hit" />
					<circle r="8.5" />
					<path d="M-4 0H4M0 -4V4" />
				</g>
			{/if}
		</svg>

		<div
			class="zoom"
			class:shown={camera !== null}
			role="group"
			aria-label="Zoom; arrow keys pan"
			data-zoombar=""
		>
			<button
				type="button"
				onclick={() => zoomAt(ZOOM_STEP)}
				aria-label="Zoom in"
				aria-keyshortcuts="+"
				title="Zoom in (+)"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
			</button>
			<button
				type="button"
				onclick={() => zoomAt(1 / ZOOM_STEP)}
				aria-label="Zoom out"
				aria-keyshortcuts="-"
				title="Zoom out (−)"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
			</button>
			<button
				type="button"
				onclick={() => fit()}
				aria-label="Fit to view"
				aria-keyshortcuts="0"
				title="Fit to view (0) · arrow keys pan"
				class:dim={!zoomed && camera === null}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"
					><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg
				>
			</button>
		</div>

		{#if editor}
			<div class="inline-editor" data-editor="" style={editorStyle}>
				<div class="field">
					<input
						type="text"
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
						aria-label={editor.kind === 'label' ? 'Transition label' : 'State name'}
						aria-invalid={editor.error ? 'true' : undefined}
						aria-describedby={editor.error ? 'graph-editor-error' : undefined}
						placeholder={editor.kind === 'label' ? '0,1 or ε' : 'Name'}
						bind:value={editor.text}
						oninput={() => {
							if (editor) editor.error = null;
						}}
						onkeydown={onEditorKeydown}
						onblur={onEditorBlur}
						{@attach autofocus}
					/>
					{#if editor.kind === 'label'}
						<button
							type="button"
							class="eps-button"
							onpointerdown={(e) => e.preventDefault()}
							onclick={insertEpsilon}
							aria-label="Insert ε"
							title="Insert ε">ε</button
						>
					{/if}
				</div>
				{#if editor.error}
					<p class="error" id="graph-editor-error" role="alert">{editor.error}</p>
				{:else}
					<p class="tip">
						Enter applies · Esc cancels{editor.kind === 'label' && editor.epsilon !== null
							? ' · empty removes'
							: ''}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if editable}
		<!-- Always present, so screen readers announce the change of mode. -->
		<p class="visually-hidden" role="status">
			{linkFrom !== null
				? `Choose the target of a transition from ${nameOf(current.states[linkFrom])}.`
				: ''}
		</p>
		<div class="editbar" role="group" aria-label="Edit">
			{#if linkFrom !== null}
				<span class="status"
					>Choose the target of a transition from <b class="mono"
						>{nameOf(current.states[linkFrom])}</b
					>.</span
				>
				<button type="button" onclick={() => (linkFrom = null)}>Cancel</button>
			{:else if selectedState !== null}
				{@const s = current.states[selectedState]}
				<span class="status">State <b class="mono">{nameOf(s)}</b></span>
				<button type="button" aria-pressed={current.start === s.id} onclick={() => makeStart(s.id)}
					>Start</button
				>
				<button type="button" aria-pressed={s.accepting} onclick={() => toggleAccepting(s.id)}
					>Accepting</button
				>
				<button type="button" onclick={() => (linkFrom = s.id)}>Add transition</button>
				<button type="button" onclick={() => openNameEditor(s.id)}>Rename</button>
				<button type="button" class="danger" onclick={deleteSelection}>Delete</button>
			{:else if selectedEdge}
				{@const e = selectedEdge}
				<span class="status"
					><b class="mono">{nameOf(current.states[e.from])}</b> →
					<b class="mono">{nameOf(current.states[e.to])}</b>
					on <b class="mono">{e.label}</b></span
				>
				<button type="button" onclick={() => openLabelEditor(e.from, e.to, e.epsilon)}
					>Edit label</button
				>
				<button type="button" class="danger" onclick={deleteSelection}>Delete</button>
			{:else}
				<button type="button" onclick={addStateInView}>Add state</button>
				<span class="hint fine"
					>Double-click empty space to add a state. Drag from a state with Shift held, or from the +
					on a selected state, to add a transition. Click a label to edit it; double-click a state
					to toggle accepting.</span
				>
				<span class="hint coarse"
					>Double-tap empty space to add a state. Tap a state, then drag its + to another state to
					add a transition. Tap a label to edit it.</span
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.automaton-view {
		--graph-bg: var(--surface);
		position: relative;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--graph-bg);
		overflow: hidden;
		min-width: 0;
	}

	.canvas {
		position: relative;
		width: 100%;
		min-height: 120px;
	}

	.drawing {
		display: block;
		width: 100%;
		height: 100%;
		position: absolute;
		inset: 0;
		cursor: grab;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
		outline: none;
	}
	/* Touch: vertical swipes scroll the page over a figure; the editor keeps every gesture. */
	.editable .drawing {
		touch-action: none;
	}
	.drawing.panning {
		cursor: grabbing;
	}
	.drawing.linking {
		cursor: crosshair;
	}

	/* ---------- groups ---------- */
	.group {
		--g: var(--accent);
	}
	.group.t1 {
		--g: var(--accept);
	}
	.group.t2 {
		--g: var(--epsilon);
	}
	.group.t3 {
		--g: var(--active);
	}
	.group.t4 {
		--g: var(--info);
	}
	.group.t5 {
		--g: var(--reject);
	}
	.group path {
		fill: color-mix(in srgb, var(--g) 8%, transparent);
		stroke: color-mix(in srgb, var(--g) 45%, transparent);
		stroke-width: 1.2;
		stroke-linejoin: round;
		transition:
			fill var(--duration) var(--ease),
			stroke var(--duration) var(--ease);
	}
	.group.halo path {
		fill: color-mix(in srgb, var(--g) 16%, transparent);
	}
	.group-label {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		fill: color-mix(in srgb, var(--g) 70%, var(--text));
	}

	/* ---------- edges ---------- */
	.edge .line,
	.start .line,
	.preview .line {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.3;
		stroke-linecap: round;
		transition:
			stroke var(--duration) var(--ease),
			stroke-width var(--duration) var(--ease),
			opacity var(--duration) var(--ease);
	}
	.edge .head,
	.start .head,
	.preview .head {
		fill: var(--edge);
		stroke: none;
		transition: fill var(--duration) var(--ease);
	}
	.edge .hit {
		fill: none;
		stroke: transparent;
		stroke-width: 14;
		pointer-events: stroke;
	}
	.edge.interactive .hit {
		cursor: pointer;
	}
	.edge.eps .line {
		stroke: var(--epsilon);
	}
	.edge.eps .head {
		fill: var(--epsilon);
	}
	.edge.dead .line {
		stroke: var(--dead);
	}
	.edge.dead .head {
		fill: var(--dead);
	}
	.edge.taken .line {
		stroke: var(--active);
		stroke-width: 2.4;
	}
	.edge.taken .head {
		fill: var(--active);
	}
	.edge.selected .line {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.edge.selected .head {
		fill: var(--accent);
	}
	.edge.interactive:hover .line {
		stroke-width: 2;
	}
	.edge,
	.label,
	.state {
		transition: opacity var(--duration) var(--ease);
	}
	.edge.dim,
	.label.dim,
	.state.dim {
		opacity: 0.28;
	}
	.preview .line {
		stroke: var(--accent);
		stroke-dasharray: 5 4;
	}
	.preview .head {
		fill: var(--accent);
	}

	/* ---------- labels ---------- */
	.label text,
	.start-label {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-size: 13px;
		fill: var(--text);
		text-anchor: middle;
		dominant-baseline: central;
		paint-order: stroke;
		stroke: var(--graph-bg);
		stroke-width: 4px;
		stroke-linejoin: round;
		transition: fill var(--duration) var(--ease);
	}
	.start-label {
		font-size: 12px;
		fill: var(--text-2);
	}
	.label rect {
		fill: transparent;
		stroke: none;
	}
	.label.interactive {
		cursor: pointer;
	}
	.label.interactive:hover rect {
		fill: var(--surface-2);
	}
	.button {
		outline: none;
	}
	.label .button:focus-visible rect {
		stroke: var(--focus);
		stroke-width: 2;
	}
	.label.eps text {
		fill: var(--epsilon);
	}
	.label.dead text {
		fill: var(--dead);
	}
	.label.taken text {
		fill: var(--active);
		font-weight: 700;
	}
	.label.selected text {
		fill: var(--accent);
		font-weight: 600;
	}

	/* ---------- states ---------- */
	.state .shape,
	.state .ring {
		fill: var(--state-fill);
		stroke: var(--state-stroke);
		stroke-width: 1.5;
		transition:
			fill var(--duration) var(--ease),
			stroke var(--duration) var(--ease),
			stroke-width var(--duration) var(--ease);
	}
	.state .ring {
		fill: var(--graph-bg);
	}
	.state .focus {
		fill: none;
		stroke: var(--focus);
		stroke-width: 2;
		opacity: 0;
	}
	.state .button:focus-visible .focus {
		opacity: 1;
	}
	.state .name {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-size: 14px;
		fill: var(--text);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	.state .retract {
		font-family: var(--font-mono);
		font-size: 17px;
		font-weight: 700;
		fill: var(--text);
		text-anchor: middle;
		dominant-baseline: central;
	}
	.state .note {
		font-family: var(--font-mono);
		font-variant-ligatures: none;
		font-size: 12px;
		fill: var(--text-2);
		dominant-baseline: central;
	}
	.state.interactive {
		cursor: pointer;
	}
	.editable .state.interactive {
		cursor: move;
	}
	.state.interactive:hover .shape {
		stroke-width: 2.2;
	}
	.state.trap .shape,
	.state.trap .ring {
		stroke: var(--dead);
		stroke-dasharray: 4 3;
	}
	.state.trap .name {
		fill: var(--dead);
	}
	.state.active .shape {
		fill: var(--active-soft);
		stroke: var(--active);
		stroke-width: 2.4;
	}
	.state.active .ring {
		stroke: var(--active);
		stroke-width: 1.8;
	}
	.state.tone-accept .shape {
		fill: var(--accept-soft);
		stroke: var(--accept);
		stroke-width: 2.4;
	}
	.state.tone-accept .ring {
		stroke: var(--accept);
	}
	.state.tone-reject .shape {
		fill: var(--reject-soft);
		stroke: var(--reject);
		stroke-width: 2.4;
	}
	.state.tone-reject .ring {
		stroke: var(--reject);
	}
	.state.tone-info .shape {
		fill: var(--info-soft);
		stroke: var(--info);
		stroke-width: 2.4;
	}
	.state.tone-info .ring {
		stroke: var(--info);
	}
	.state.selected .shape,
	.state.selected .ring,
	.state.link-source .shape {
		stroke: var(--accent);
		stroke-width: 2.4;
	}
	.state.selected .shape {
		fill: var(--accent-soft);
	}
	.state.link-target .shape {
		stroke: var(--accent);
		stroke-width: 2.4;
		fill: var(--accent-soft);
	}

	/* ---------- editor handle ---------- */
	.handle {
		cursor: crosshair;
		outline: none;
	}
	.handle circle {
		fill: var(--accent);
		stroke: var(--graph-bg);
		stroke-width: 2;
	}
	.handle .handle-hit {
		fill: transparent;
		stroke: none;
	}
	.handle path {
		stroke: var(--accent-contrast);
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.handle:focus-visible circle:not(.handle-hit) {
		stroke: var(--focus);
		stroke-width: 3;
	}

	/* ---------- overlays ---------- */
	.zoom {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		gap: 2px;
		padding: 2px;
		background: color-mix(in srgb, var(--graph-bg) 88%, transparent);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-sm);
	}
	@media (hover: hover) {
		.zoom {
			opacity: 0;
			transition: opacity var(--duration) var(--ease);
		}
		.automaton-view:hover .zoom,
		.zoom.shown,
		.zoom:focus-within {
			opacity: 1;
		}
	}
	.zoom button {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			color var(--duration) var(--ease);
	}
	.zoom button:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.zoom button.dim {
		color: var(--text-3);
	}
	.zoom svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.inline-editor {
		position: absolute;
		transform: translate(-50%, -50%);
		z-index: 2;
		display: grid;
		gap: 4px;
		justify-items: center;
		width: max-content;
		max-width: min(280px, 90%);
	}
	.inline-editor .field {
		display: flex;
		align-items: stretch;
		background: var(--surface);
		border: 1.5px solid var(--accent);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.inline-editor input {
		width: 11ch;
		min-width: 0;
		padding: 4px 8px;
		border: 0;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 14px;
		font-variant-ligatures: none;
		outline: none;
	}
	.inline-editor input[aria-invalid='true'] {
		color: var(--reject);
	}
	.eps-button {
		padding: 0 9px;
		border: 0;
		border-left: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--epsilon);
		font-family: var(--font-mono);
		font-size: 14px;
		cursor: pointer;
	}
	.eps-button:hover {
		background: var(--surface-3);
	}
	.inline-editor p {
		margin: 0;
		padding: 2px 8px;
		font-size: var(--text-xs);
		line-height: 1.4;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		text-align: center;
	}
	.inline-editor .tip {
		color: var(--text-3);
	}
	.inline-editor .error {
		color: var(--reject);
		background: var(--reject-soft);
	}

	.editbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		border-top: 1px solid var(--border);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}
	.editbar .status {
		color: var(--text-2);
		margin-right: 4px;
	}
	.editbar .hint {
		color: var(--text-3);
		font-size: var(--text-xs);
		line-height: 1.45;
		flex: 1 1 16rem;
	}
	.editbar .hint.coarse {
		display: none;
	}
	@media (pointer: coarse) {
		.editbar .hint.fine {
			display: none;
		}
		.editbar .hint.coarse {
			display: inline;
		}
	}
	.editbar button {
		padding: 3px 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			background var(--duration) var(--ease),
			border-color var(--duration) var(--ease);
	}
	.editbar button:hover {
		background: var(--surface-3);
	}
	.editbar button[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}
	.editbar button.danger {
		color: var(--reject);
	}
	.editbar button.danger:hover {
		background: var(--reject-soft);
		border-color: var(--reject);
	}
</style>
