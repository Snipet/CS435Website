/**
 * The rules as a flex specification (Scanning with Flex, slides 4–10): one
 * pattern per rule in order, helper definitions written out in place, and an
 * action that prints the token pair. Dropped rules get an empty action; the
 * Error rule becomes `.|\n` listed last.
 */
import { printRegex } from '$lib/theory/regex';
import type { TokenFormat } from '$lib/components/ui/token-format';
import type { RuleInfo } from './spec';

/** A C string literal for `s`. */
export function cString(s: string): string {
	let out = '"';
	for (const ch of s) {
		if (ch === '"' || ch === '\\') out += `\\${ch}`;
		else if (ch === '\n') out += '\\n';
		else if (ch === '\t') out += '\\t';
		else if (ch === '\r') out += '\\r';
		else out += ch;
	}
	return out + '"';
}

/** The printf action that reports a token in the chosen pair format. */
export function printAction(name: string, format: TokenFormat): string {
	const fmt = format === 'paren' ? '"(%s, \\"%s\\")\\n"' : `"<%s,'%s'>\\n"`;
	return `{ printf(${fmt}, ${cString(name)}, yytext); }`;
}

export interface FlexExport {
	spec: string;
	/** Rules left out because they have problems (1-based). */
	skipped: number[];
}

export function toFlexSpec(
	rules: readonly RuleInfo[],
	opts: { errorRule?: boolean; format?: TokenFormat } = {}
): FlexExport {
	const format = opts.format ?? 'paren';
	const lines: { pattern: string; action: string }[] = [];
	const skipped: number[] = [];
	for (const r of rules) {
		if (!r.regex) {
			if (r.problem !== 'blank') skipped.push(r.index + 1);
			continue;
		}
		lines.push({
			pattern: printRegex(r.regex, { dialect: 'flex', expandRefs: true }),
			action: r.drop ? '{ }' : printAction(r.name, format)
		});
	}
	if (opts.errorRule) lines.push({ pattern: '.|\\n', action: printAction('Error', format) });
	const width = Math.min(28, Math.max(8, ...lines.map((l) => l.pattern.length)));
	const body = lines.map((l) => `${l.pattern.padEnd(width)}  ${l.action}`).join('\n');
	const spec = [
		'%top{',
		'  #include <stdio.h>',
		'}',
		'',
		'%%',
		'',
		body,
		'',
		'%%',
		'',
		'int main ()',
		'{ yylex (); return 0;',
		'}',
		''
	].join('\n');
	return { spec, skipped };
}
