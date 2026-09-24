/**
 * Token rules for the "From token rules" source: one rule per line,
 * `Name = RE` in lecture notation, listed in priority order (the earlier rule
 * wins a tie, Lexical Analysis II slide 11). Lines starting with `//` are
 * comments. REs may use the regular definitions.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { parseRegex, type DefinitionsResult } from '$lib/theory/regex';
import type { TokenRule } from '$lib/theory/automata';

const RULE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface RulesResult {
	rules: TokenRule[];
	/** Spans index into the rules text (source null). */
	diagnostics: Diagnostic[];
}

/** Moves a diagnostic from the text of one RE to its place in the rules text. */
function shift(
	d: Diagnostic,
	offset: number,
	fallback: { start: number; end: number }
): Diagnostic {
	if (d.span && d.span.source === null)
		return {
			...d,
			span: { start: d.span.start + offset, end: d.span.end + offset, source: null }
		};
	// A span in a definition body points into the other editor: mark the whole RE.
	return { ...d, span: { ...fallback, source: null } };
}

export function parseRules(
	text: string,
	defs: Pick<DefinitionsResult, 'defs' | 'invalid'>
): RulesResult {
	const rules: TokenRule[] = [];
	const diagnostics: Diagnostic[] = [];
	const at = (start: number, end: number) => ({ start, end, source: null });
	let offset = 0;
	for (const raw of text.split('\n')) {
		const lineStart = offset;
		offset += raw.length + 1;
		const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		const body = content.trim();
		if (body === '' || body.startsWith('//')) continue;
		const lead = content.length - content.trimStart().length;
		const lineEnd = lineStart + content.trimEnd().length;
		const eq = content.indexOf('=');
		if (eq < 0) {
			diagnostics.push({
				severity: 'error',
				message: 'Expected a rule: Name = RE',
				span: at(lineStart + lead, lineEnd)
			});
			continue;
		}
		const name = content.slice(0, eq).trim();
		if (!RULE_NAME.test(name)) {
			diagnostics.push({
				severity: 'error',
				message:
					name === ''
						? 'Missing token name before ='
						: `${name} is not a valid token name: use letters, digits, and _, starting with a letter or _`,
				span:
					name === ''
						? at(lineStart + eq, lineStart + eq + 1)
						: at(lineStart + lead, lineStart + lead + name.length)
			});
			continue;
		}
		const after = content.slice(eq + 1);
		const exprStart = lineStart + eq + 1 + (after.length - after.trimStart().length);
		const exprEnd = Math.max(exprStart, lineEnd);
		const expr = text.slice(exprStart, exprEnd);
		const whole = { start: exprStart, end: Math.max(exprEnd, exprStart + 1) };
		const parsed = parseRegex(expr, { defs: defs.defs, invalid: defs.invalid });
		for (const d of parsed.diagnostics) diagnostics.push(shift(d, exprStart, whole));
		if (parsed.ok) rules.push({ name, regex: parsed.regex });
	}
	if (rules.length === 0 && !diagnostics.some((d) => d.severity === 'error'))
		diagnostics.push({
			severity: 'error',
			message: 'Add a rule such as Integer = digit+',
			span: at(0, 0)
		});
	return { rules, diagnostics };
}
