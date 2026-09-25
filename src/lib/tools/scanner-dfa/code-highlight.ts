/**
 * Minimal C-like coloring for the short programs on the slides: keywords,
 * comments, character literals and numbers (global `hl-*` classes).
 */

export interface CodeToken {
	text: string;
	className?: string;
}

const KEYWORDS = new Set([
	'while',
	'if',
	'else',
	'return',
	'switch',
	'case',
	'break',
	'const',
	'int',
	'Token'
]);

const PATTERN = /(\/\/.*$)|('(?:\\.|[^'\\])*')|(\b\d+\b)|([A-Za-z_]\w*)/g;

export function highlightC(line: string): CodeToken[] {
	const out: CodeToken[] = [];
	let last = 0;
	for (const m of line.matchAll(PATTERN)) {
		const at = m.index ?? 0;
		if (at > last) out.push({ text: line.slice(last, at) });
		const [text, comment, char, number, word] = m;
		if (comment) out.push({ text, className: 'hl-comment' });
		else if (char) out.push({ text, className: 'hl-string' });
		else if (number) out.push({ text, className: 'hl-number' });
		else if (word && KEYWORDS.has(word)) out.push({ text, className: 'hl-keyword' });
		else out.push({ text });
		last = at + text.length;
	}
	if (last < line.length) out.push({ text: line.slice(last) });
	return out;
}
