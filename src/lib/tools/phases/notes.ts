/**
 * Short notes under each phase's output: what the phase changed.
 */
import type { Compilation, PhaseId } from './pipeline';
import { isTemp } from './tac';
import { formatInstr, type Instr } from './vax';

export type PhaseNotes = Partial<Record<PhaseId, string[]>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `t1, t2 and t3`; a long list keeps its first three items and its last: `t1, t2, t3, …, t40`. */
function list(items: string[]): string {
	if (items.length <= 1) return items.join('');
	if (items.length > 6) return `${items.slice(0, 3).join(', ')}, …, ${items[items.length - 1]}`;
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Most items a list under a phase shows; the rest are counted. */
export const MAX_LISTED = 20;

/** The first `max` items and how many are left out. */
export function capList<T>(items: readonly T[], max = MAX_LISTED): { shown: T[]; more: number } {
	return { shown: items.slice(0, max), more: Math.max(0, items.length - max) };
}

/** The code generator's output on Intro (cont'd), compiler architecture, slide 4. */
export const SLIDE_4_CODE: readonly string[] = [
	'CVTLF B1,r2',
	'MOVF #2.3,r1',
	'ADDF2 r1,r2',
	'MOVF r2,A'
];

/**
 * The instruction the slide's footnote is about (CVTLF B1,r2), or -1 unless
 * the code is exactly the slide's.
 */
export function slideFootnoteIndex(code: readonly Instr[] | null): number {
	if (!code || code.length !== SLIDE_4_CODE.length) return -1;
	return code.every((i, k) => formatInstr(i) === SLIDE_4_CODE[k]) ? 0 : -1;
}

export function phaseNotes(c: Compilation): PhaseNotes {
	const notes: PhaseNotes = {};
	const tokens = c.scan.tokens.length;
	if (tokens > 0) {
		const spaced = /\s/.test(c.source);
		notes.scanner = [
			`${plural(tokens, 'token')}.${spaced ? ' Whitespace separates lexemes and produces no token.' : ''}`
		];
	}
	const stmts = c.parse?.program?.stmts.length ?? 0;
	if (stmts > 1) notes.parser = [`${stmts} statements, one tree each.`];

	if (c.semantic && c.stoppedAt === null) {
		notes.semantic = c.semantic.conversions.length
			? c.semantic.conversions.map((t) => `int2fp inserted: ${t}.`)
			: ['Every operation has operands of one type; no conversion is needed.'];
	}

	if (c.tac) {
		const temps = new Set<string>();
		const labels: string[] = [];
		for (const q of c.tac) {
			if (isTemp(q.result)) temps.add(q.result);
			if (q.op === 'label' && q.result) labels.push(q.result);
		}
		const parts = [plural(c.tac.filter((q) => q.op !== 'label').length, 'quad')];
		if (temps.size) parts.push(`temporaries ${list([...temps])}`);
		if (labels.length) parts.push(`labels ${list(labels)}`);
		notes.icg = [`${parts[0]}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}.`];
	}

	if (c.optimized) {
		notes.optimizer = c.optimized.changes.length
			? c.optimized.changes.map((ch) => ch.text)
			: ['No constant to propagate or fold and no copy to remove.'];
	}

	if (c.code && c.code.length) {
		notes.codegen = [
			'One quad at a time: temporaries live in r2, r3, …; r1 holds a loaded operand.'
		];
	}

	if (c.peephole) {
		notes.peephole = c.peephole.rewrites.length
			? c.peephole.rewrites.map((r) => {
					const after = r.after.length ? r.after.join(' ; ') : 'nothing';
					return `${r.before.join(' ; ')} → ${after} (${r.reason}).`;
				})
			: c.code?.length
				? ['No pattern applies.']
				: [];
	}
	return notes;
}
