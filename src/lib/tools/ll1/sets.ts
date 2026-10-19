/**
 * First and Follow step by step (Table-based Predictive Parsing, slides
 * 20–23), and the fill-in mode of the sets table ("First( E ) = ?").
 *
 * The steps are the engine's rule applications (firstFollow), First first and
 * then Follow, each followed by a step that says the last pass changed
 * nothing: the rules are applied until no set changes.
 */
import {
	EPSILON,
	printSet,
	printSymbols,
	scanGrammar,
	sortForDisplay,
	terminalRanks,
	type FirstFollow,
	type FirstFollowStep,
	type Grammar
} from '$lib/theory/grammar';

export type SetKind = 'first' | 'follow';

export type SetStep =
	| { kind: 'rule'; phase: SetKind; rule: FirstFollowStep }
	/** The pass `pass` changed nothing: the sets of `phase` are complete. */
	| { kind: 'done'; phase: SetKind; pass: number };

/** First's steps, a done step, Follow's steps, a done step. */
export function setSteps(ff: FirstFollow): SetStep[] {
	return [
		...ff.firstSteps.map((rule): SetStep => ({ kind: 'rule', phase: 'first', rule })),
		{ kind: 'done', phase: 'first', pass: ff.firstPasses },
		...ff.followSteps.map((rule): SetStep => ({ kind: 'rule', phase: 'follow', rule })),
		{ kind: 'done', phase: 'follow', pass: ff.followPasses }
	];
}

export const passOf = (s: SetStep): number => (s.kind === 'rule' ? s.rule.pass : s.pass);

/** The sets after step `index`: null for a set whose computation has not started. */
export interface SetsAt {
	first: Map<string, string[]> | null;
	follow: Map<string, string[]> | null;
}

/**
 * The First and Follow sets after `steps[0..index]`: First of every symbol
 * once First has started, Follow once it has; members in display order.
 */
export function setsAt(
	g: Grammar,
	ff: FirstFollow,
	steps: readonly SetStep[],
	index: number
): SetsAt {
	const rank = terminalRanks(g);
	const symbols = [...ff.first.keys()];
	const grow = (phase: SetKind): Map<string, string[]> | null => {
		const at = new Map<string, Set<string>>(symbols.map((s) => [s, new Set()]));
		let started = false;
		for (let i = 0; i <= index && i < steps.length; i++) {
			const s = steps[i];
			if (s.phase !== phase) continue;
			started = true;
			if (s.kind === 'rule') for (const m of s.rule.added) at.get(s.rule.target)?.add(m);
		}
		if (!started) return null;
		return new Map([...at].map(([s, set]) => [s, sortForDisplay(rank, set)]));
	};
	return { first: grow('first'), follow: grow('follow') };
}

/** A pass of First or Follow: where it starts in the steps, and how many members it added. */
export interface PassSummary {
	phase: SetKind;
	pass: number;
	/** Index of its first step in `setSteps`. */
	start: number;
	/** Index of its last step (the done step for the last pass). */
	end: number;
	added: number;
}

export function passSummaries(steps: readonly SetStep[]): PassSummary[] {
	const out: PassSummary[] = [];
	steps.forEach((s, i) => {
		const pass = passOf(s);
		const last = out[out.length - 1];
		const added = s.kind === 'rule' ? s.rule.added.length : 0;
		// The done step closes the last pass rather than opening one.
		if (last && last.phase === s.phase && (last.pass === pass || s.kind === 'done')) {
			last.end = i;
			last.added += added;
		} else out.push({ phase: s.phase, pass, start: i, end: i, added });
	});
	return out;
}

const NAME: Record<SetKind, string> = { first: 'First', follow: 'Follow' };

/** `First( E )` */
export const setName = (kind: SetKind, symbol: string): string =>
	`${NAME[kind]}( ${printSymbols([symbol])} )`;

/**
 * A member as a set prints it: `ε` (the empty string) bare, everything else as
 * the grammar writes it (`"ε"` is a terminal named ε).
 */
export function memberText(m: string): string {
	return m === EPSILON ? m : printSet([m]).slice(2, -2);
}

/** The words of a step: the rule as the slides write it, then what it did. */
export function stepText(g: Grammar, s: SetStep, sets: SetsAt): { rule: string; result: string } {
	if (s.kind === 'done')
		return {
			rule: `Pass ${s.pass} changes nothing.`,
			result: `The ${NAME[s.phase]} sets are complete.`
		};
	const r = s.rule;
	const set = (s.phase === 'first' ? sets.first : sets.follow)?.get(r.target) ?? [];
	const now = `${setName(s.phase, r.target)} = ${printSet(set)}`;
	if (['first-terminal', 'first-stop', 'follow-stop', 'first-self'].includes(r.rule))
		return { rule: r.text, result: '' };
	if (r.added.length === 0) return { rule: r.text, result: `No change: ${now}` };
	return {
		rule: r.text,
		result: `Adds ${r.added.map(memberText).join(', ')}: ${now}`
	};
}

/** `E → T X`, or the rule of pass 0. */
export function stepContext(g: Grammar, s: SetStep): string {
	if (s.kind === 'done') return '';
	const r = s.rule;
	if (r.production === null)
		return r.rule === 'first-terminal' ? 'First(b) = { b } for each terminal b' : 'Start symbol';
	const p = g.productions[r.production];
	return `${printSymbols([p.lhs])} → ${printSymbols(p.rhs)}`;
}

// ───────────────────────────── fill-in ─────────────────────────────

const QUOTES = `"'“”‘’`;

/** A set as typed: `{ (, int }`, `( int`, `{ +, ε }`, `{ }`. */
export interface SetAnswer {
	/** The members typed, in the order typed, each once (`ε` for ε or epsilon). */
	members: string[];
	error: string | null;
}

/**
 * Reads a set typed into a cell. Braces around it are optional; members are
 * separated by commas or spaces. A comma or brace that is a member is written
 * in quotes (`","`). `ε`, `epsilon` and `$` stand for themselves.
 */
export function readAnswer(text: string): SetAnswer {
	const tokens = scanGrammar(text).filter((t) => t.kind !== 'comment');
	const members: string[] = [];
	const bare = (t: (typeof tokens)[number], name: string) =>
		t.name === name && !QUOTES.includes(text[t.span.start]);
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.kind === 'epsilon') {
			if (!members.includes(EPSILON)) members.push(EPSILON);
			continue;
		}
		if (t.kind !== 'terminal' && t.kind !== 'nonterminal')
			return { members, error: `${text.slice(t.span.start, t.span.end)} cannot be in a set.` };
		if (bare(t, ',')) continue;
		if ((i === 0 && bare(t, '{')) || (i === tokens.length - 1 && bare(t, '}'))) continue;
		const name = t.name!;
		if (!members.includes(name)) members.push(name);
	}
	return { members, error: null };
}

export interface AnswerCheck {
	/** Each member typed, and whether it is in the set. */
	marks: { member: string; ok: boolean }[];
	/** Members of the set that were not typed. */
	missing: number;
	correct: boolean;
}

export function checkAnswer(answer: SetAnswer, expected: readonly string[]): AnswerCheck {
	const want = new Set(expected);
	const marks = answer.members.map((member) => ({ member, ok: want.has(member) }));
	const missing = expected.filter((m) => !answer.members.includes(m)).length;
	return {
		marks,
		missing,
		correct: answer.error === null && missing === 0 && marks.every((m) => m.ok)
	};
}

/** What a check of one set says: `Follow( E ): + is not in the set, 1 missing.` */
export function checkWords(name: string, answer: SetAnswer, check: AnswerCheck): string {
	if (answer.error) return `${name}: ${answer.error}`;
	if (check.correct) return `${name}: right.`;
	const parts = check.marks
		.filter((m) => !m.ok)
		.map((m) => `${memberText(m.member)} is not in the set`);
	if (check.missing > 0) parts.push(`${check.missing} missing`);
	return `${name}: ${parts.join(', ')}.`;
}

/** `2 of 3 checked are right.` */
export const scoreText = (right: number, checked: number): string =>
	`${right} of ${checked} checked ${checked === 1 ? 'is' : 'are'} right.`;

/** What Check says for every set checked: the score, then each set that is not right. */
export function checkSummary(
	checks: readonly { name: string; answer: SetAnswer; check: AnswerCheck }[]
): string {
	if (checks.length === 0) return 'Nothing to check: type a set first.';
	const right = checks.filter((c) => c.check.correct).length;
	return [
		scoreText(right, checks.length),
		...checks.filter((c) => !c.check.correct).map((c) => checkWords(c.name, c.answer, c.check))
	].join(' ');
}
