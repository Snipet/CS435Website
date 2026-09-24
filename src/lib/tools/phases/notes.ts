/**
 * Short notes under each phase's output: what the phase changed.
 */
import type { Compilation, PhaseId } from './pipeline';
import { isTemp } from './tac';

export type PhaseNotes = Partial<Record<PhaseId, string[]>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function list(items: string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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
