/**
 * printf-style formatting: %d %i %u %ld %c %s %f %e %g %x %o %p %% with
 * flags (- + space 0 #), width and precision (numbers or *), and length
 * modifiers (hh h l ll L z j t, accepted and ignored).
 */

/** A printf argument as the formatter sees it. */
export type FormatArg =
	| { t: 'int'; v: number }
	| { t: 'double'; v: number }
	| { t: 'str'; v: string | null }
	| { t: 'ptr'; v: number };

export interface FormatResult {
	text: string;
	/** Problems C would not report but that print something unexpected (e.g. %d of a double). */
	warnings: string[];
	/** A fatal problem (e.g. too few arguments); the text up to it is kept. */
	error?: string;
}

interface Spec {
	flags: string;
	width: number | null;
	precision: number | null;
	conv: string;
}

function pad(s: string, spec: Spec, zeroOk: boolean): string {
	const width = spec.width ?? 0;
	if (s.length >= width) return s;
	if (spec.flags.includes('-')) return s + ' '.repeat(width - s.length);
	if (zeroOk && spec.flags.includes('0')) {
		// Zeros go after the sign and any 0x prefix.
		const m = /^([+\- ]?(?:0[xX])?)(.*)$/.exec(s)!;
		return m[1] + '0'.repeat(width - s.length) + m[2];
	}
	return ' '.repeat(width - s.length) + s;
}

function sign(neg: boolean, flags: string): string {
	if (neg) return '-';
	if (flags.includes('+')) return '+';
	if (flags.includes(' ')) return ' ';
	return '';
}

/** Rounds |x| to `prec` decimals like glibc: exact ties go to even. */
function toFixedC(x: number, prec: number): string {
	const s = x.toFixed(prec);
	if (prec > 20) return s;
	const scaled = x * 10 ** prec;
	if (
		Number.isFinite(scaled) &&
		Math.abs(scaled) < 2 ** 52 &&
		scaled - Math.floor(scaled) === 0.5
	) {
		const down = Math.floor(scaled);
		const even = down % 2 === 0 ? down : down + 1;
		const digits = even.toString().padStart(prec + 1, '0');
		return prec === 0 ? digits : `${digits.slice(0, -prec)}.${digits.slice(-prec)}`;
	}
	return s;
}

/** d.ddde±XX */
function toExpC(x: number, prec: number): string {
	const s = x.toExponential(prec);
	const m = /^(\d(?:\.\d+)?)e([+-])(\d+)$/.exec(s)!;
	return `${m[1]}e${m[2]}${m[3].padStart(2, '0')}`;
}

function formatFloat(v: number, spec: Spec): string {
	const upper = spec.conv === spec.conv.toUpperCase();
	const neg = v < 0 || Object.is(v, -0);
	const a = Math.abs(v);
	const alt = spec.flags.includes('#');
	let body: string;
	if (!Number.isFinite(v)) {
		body = Number.isNaN(v) ? 'nan' : 'inf';
		body = sign(neg && !Number.isNaN(v), spec.flags) + (upper ? body.toUpperCase() : body);
		return pad(body, spec, false);
	}
	const conv = spec.conv.toLowerCase();
	let prec = spec.precision ?? 6;
	if (conv === 'f') {
		body = toFixedC(a, prec);
		if (alt && prec === 0) body += '.';
	} else if (conv === 'e') {
		body = toExpC(a, prec);
		if (alt && prec === 0) body = body.replace('e', '.e');
	} else {
		// %g
		if (prec === 0) prec = 1;
		const exp = a === 0 ? 0 : Number(toExpC(a, prec - 1).split('e')[1]);
		if (prec > exp && exp >= -4) body = toFixedC(a, prec - 1 - exp);
		else body = toExpC(a, prec - 1);
		if (!alt) {
			const [mant, e] = body.split('e');
			let m = mant;
			if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '');
			body = e === undefined ? m : `${m}e${e}`;
		}
	}
	if (upper) body = body.toUpperCase();
	return pad(sign(neg, spec.flags) + body, spec, true);
}

function formatInt(v: number, spec: Spec, long: boolean): string {
	const conv = spec.conv;
	let n = Math.trunc(v);
	let neg = false;
	let digits: string;
	if (conv === 'd' || conv === 'i') {
		neg = n < 0;
		digits = Math.abs(n).toString();
	} else {
		// Unsigned conversions show negative values in two's complement.
		if (n < 0) n = long ? Number(BigInt.asUintN(64, BigInt(n))) : n >>> 0;
		const radix = conv === 'o' ? 8 : conv === 'u' ? 10 : 16;
		digits =
			long && v < 0 ? BigInt.asUintN(64, BigInt(Math.trunc(v))).toString(radix) : n.toString(radix);
		if (conv === 'X') digits = digits.toUpperCase();
	}
	if (spec.precision !== null) {
		if (spec.precision === 0 && n === 0) digits = '';
		digits = digits.padStart(spec.precision, '0');
	}
	let prefix = '';
	if (spec.flags.includes('#')) {
		if ((conv === 'x' || conv === 'X') && n !== 0) prefix = conv === 'x' ? '0x' : '0X';
		if (conv === 'o' && !digits.startsWith('0')) digits = '0' + digits;
	}
	const s = (conv === 'd' || conv === 'i' ? sign(neg, spec.flags) : '') + prefix + digits;
	return pad(s, spec, spec.precision === null);
}

/**
 * Formats like C's printf. `next` returns the next argument (undefined when
 * there are no more).
 */
export function formatC(fmt: string, next: () => FormatArg | undefined): FormatResult {
	let out = '';
	const warnings: string[] = [];
	const re = /%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d*))?(hh|h|ll|l|L|z|j|t|q)?([diouxXcsfFeEgGaAp%n])?/g;
	let last = 0;
	for (let m = re.exec(fmt); m; m = re.exec(fmt)) {
		out += fmt.slice(last, m.index);
		last = re.lastIndex;
		const [whole, flags, w, p, len, conv] = m;
		if (!conv) {
			return { text: out, warnings, error: `unknown conversion ${whole} in the format string` };
		}
		if (conv === '%') {
			out += '%';
			continue;
		}
		const spec: Spec = { flags, width: null, precision: null, conv };
		const needArg = (): FormatArg | null => {
			const a = next();
			return a ?? null;
		};
		if (w === '*') {
			const a = needArg();
			if (!a) return { text: out, warnings, error: `printf: no argument for * in ${whole}` };
			const n = Math.trunc(a.v === null ? 0 : Number(a.v));
			if (n < 0) {
				spec.flags += '-';
				spec.width = -n;
			} else spec.width = n;
		} else if (w) spec.width = Number(w);
		if (p === '*') {
			const a = needArg();
			if (!a) return { text: out, warnings, error: `printf: no argument for .* in ${whole}` };
			const n = Math.trunc(Number(a.v));
			spec.precision = n < 0 ? null : n;
		} else if (p !== undefined) spec.precision = p === '' ? 0 : Number(p);
		if (conv === 'n') return { text: out, warnings, error: '%n is not supported' };
		const arg = needArg();
		if (!arg)
			return {
				text: out,
				warnings,
				error: `printf: no argument for ${whole} in the format string`
			};
		const long = len === 'l' || len === 'll' || len === 'q' || len === 'j' || len === 'z';
		switch (conv) {
			case 'd':
			case 'i':
			case 'u':
			case 'x':
			case 'X':
			case 'o': {
				if (arg.t === 'double') warnings.push(`${whole} expects an integer but got a double`);
				if (arg.t === 'str') {
					warnings.push(`${whole} expects an integer but got a string`);
					out += pad('?', spec, false);
					break;
				}
				out += formatInt(Number(arg.v), spec, long);
				break;
			}
			case 'c': {
				if (arg.t === 'str') {
					warnings.push(`${whole} expects a character but got a string`);
					break;
				}
				const code = Math.trunc(Number(arg.v)) & 0xff;
				out += pad(
					String.fromCharCode(code),
					{ ...spec, flags: spec.flags.replace('0', '') },
					false
				);
				break;
			}
			case 's': {
				if (arg.t !== 'str') {
					return {
						text: out,
						warnings,
						error: `${whole} expects a string (char *) but got a number`
					};
				}
				let s = arg.v === null ? '(null)' : arg.v;
				if (spec.precision !== null) s = s.slice(0, spec.precision);
				out += pad(s, { ...spec, flags: spec.flags.replace('0', '') }, false);
				break;
			}
			case 'p':
				out += pad(
					arg.t === 'ptr' && arg.v === 0 ? '(nil)' : `0x${Number(arg.v).toString(16)}`,
					spec,
					false
				);
				break;
			case 'a':
			case 'A':
				return { text: out, warnings, error: `${whole} is not supported` };
			default: {
				if (arg.t === 'str') {
					return { text: out, warnings, error: `${whole} expects a number but got a string` };
				}
				if (arg.t === 'int') warnings.push(`${whole} expects a double but got an integer`);
				out += formatFloat(Number(arg.v), spec);
			}
		}
	}
	out += fmt.slice(last);
	return { text: out, warnings };
}
