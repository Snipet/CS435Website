/**
 * ASCII spellings of lecture symbols, converted as the user types in a
 * RegexField. Conversion skips quoted literals ('…', "…", ‘…’) and escaped
 * backslashes, so `'\e'` and `\\e` are left alone.
 */
export const DEFAULT_ALIASES: Readonly<Record<string, string>> = {
	'\\e': 'ε',
	'\\p': 'ɸ',
	'\\S': 'Σ'
};

const CLOSING: Record<string, string> = { "'": "'", '"': '"', '‘': '’' };

export interface AliasResult {
	text: string;
	caret: number;
	changed: boolean;
}

export function applyAliases(
	text: string,
	caret: number,
	aliases: Readonly<Record<string, string>> = DEFAULT_ALIASES
): AliasResult {
	const keys = Object.keys(aliases).filter((k) => k.startsWith('\\') && k.length > 1);
	let out = '';
	let newCaret = caret;
	let changed = false;
	let quote: string | null = null;
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (quote) {
			if (ch === '\\' && i + 1 < text.length) {
				out += text.slice(i, i + 2);
				i += 2;
				continue;
			}
			if (ch === quote || (quote === '’' && ch === "'")) quote = null;
			out += ch;
			i++;
			continue;
		}
		if (ch in CLOSING) {
			quote = CLOSING[ch];
			out += ch;
			i++;
			continue;
		}
		if (ch === '\\') {
			const key = keys.find((k) => text.startsWith(k, i));
			if (key) {
				const symbol = aliases[key];
				const end = i + key.length;
				if (caret >= end) newCaret -= key.length - symbol.length;
				else if (caret > i) newCaret = out.length + symbol.length;
				out += symbol;
				i = end;
				changed = true;
				continue;
			}
			// Any other escape pair (e.g. `\\`) is copied as a unit.
			out += text.slice(i, i + 2);
			i += 2;
			continue;
		}
		out += ch;
		i++;
	}
	return { text: out, caret: Math.max(0, Math.min(newCaret, out.length)), changed };
}
