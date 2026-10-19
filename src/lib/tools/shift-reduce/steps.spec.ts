/**
 * The page's steppers and its share link, replayed in the order the page runs
 * them: the link's state is read while the parse shown is still the default
 * one, and the linked parse arrives from the worker afterwards.
 */
import { describe, expect, it } from 'vitest';
import { Stepper } from '$lib/components/ui';
import { decode, encode } from '$lib/url-state';
import { computeParse, sameRequest, type ParseRequest, type ParseView } from './model';
import { DEFAULT_STATE, isShiftReduceHash, stateFromHash, type ShiftReduceState } from './state';
import { linkStep, stepperIndex } from './steps';
import { traceRows } from './view';

function parse(request: ParseRequest): ParseView {
	const r = computeParse(request);
	if (r.kind !== 'parse') throw new Error(r.message);
	return r;
}

/**
 * The page's four effects on one stepper: the link's step goes to the stepper,
 * and the stepper's place goes back to the link, both only while `current`.
 */
function sync(stepper: Stepper, form: { step: number | null }, total: number, current: boolean) {
	const at = stepperIndex(form.step, total, current);
	if (at !== null) stepper.set(at);
	const next = linkStep(stepper.index, total, current);
	if (next !== undefined && form.step !== next) form.step = next;
}

describe('a link to a step of a long parse', () => {
	const shown = parse({ grammar: DEFAULT_STATE.grammar, input: DEFAULT_STATE.input });
	const link = {
		grammar: 'E → E + ( E ) | int',
		input: 'int + ( int ) + ( int ) + ( int ) + ( int )',
		collapse: false,
		step: 20,
		view: 'handles' as const,
		handleStep: 7
	};
	const linked = parse({ grammar: link.grammar, input: link.input });

	it('opens on the linked row, past the end of the parse shown before it arrives', () => {
		const hash = decode(encode(link), isShiftReduceHash);
		expect(hash).not.toBeNull();
		const form: ShiftReduceState = stateFromHash(hash!);
		const request = { grammar: form.grammar, input: form.input };

		// The page opens on the slide 14 parse: 11 rows (collapsed), the last one shown.
		let rows = traceRows(shown.parse, true);
		const stepper = new Stepper(() => rows.length, { index: rows.length - 1 });
		expect(rows).toHaveLength(11);

		// The link is read; its parse is computed in the worker. The rows are still slide 14's.
		rows = traceRows(shown.parse, form.collapse);
		const waiting = sameRequest(
			{ grammar: DEFAULT_STATE.grammar, input: DEFAULT_STATE.input },
			request
		);
		expect(waiting).toBe(false);
		sync(stepper, form, rows.length, waiting);
		// The stepper stays on the row it was on, inside the rows on the page…
		expect(stepper.index).toBe(10);
		// …and the link keeps its step, past their end.
		expect(form.step).toBe(20);

		// The linked parse arrives: 27 rows, one shift per row.
		rows = traceRows(linked.parse, form.collapse);
		expect(rows).toHaveLength(27);
		sync(stepper, form, rows.length, sameRequest(request, request));
		expect(stepper.index).toBe(20);
		expect(form.step).toBe(20);
		stepper.dispose();
	});

	it('keeps the linked reduction of the Handles view', () => {
		const form = stateFromHash(link);
		let total = shown.handles!.length;
		const stepper = new Stepper(() => total, { index: total - 1 });
		expect(total).toBe(6);
		const handle = { step: form.handleStep };
		sync(stepper, handle, total, false);
		expect(stepper.index).toBe(5);
		expect(handle.step).toBe(7);

		total = linked.handles!.length;
		expect(total).toBe(10);
		sync(stepper, handle, total, true);
		expect(stepper.index).toBe(7);
		expect(handle.step).toBe(7);
		stepper.dispose();
	});

	it('still clamps a step past the end of the current parse, and writes the last as null', () => {
		const rows = traceRows(linked.parse, false);
		const stepper = new Stepper(() => rows.length);
		const form = { step: 9999 as number | null };
		sync(stepper, form, rows.length, true);
		expect(stepper.index).toBe(rows.length - 1);
		expect(form.step).toBeNull();

		// A step in range is written back as it is; stepping to the end writes null.
		form.step = 4;
		sync(stepper, form, rows.length, true);
		expect(stepper.index).toBe(4);
		expect(form.step).toBe(4);
		stepper.last();
		sync(stepper, { step: null }, rows.length, true);
		expect(linkStep(stepper.index, rows.length, true)).toBeNull();
		stepper.dispose();
	});

	it('leaves the stepper and the link alone without a current parse', () => {
		expect(stepperIndex(5, 10, false)).toBeNull();
		expect(stepperIndex(5, 0, true)).toBeNull();
		expect(stepperIndex(null, 10, true)).toBe(9);
		expect(linkStep(3, 10, false)).toBeUndefined();
		expect(linkStep(3, 0, true)).toBeUndefined();
		expect(linkStep(3, 10, true)).toBe(3);
		expect(linkStep(9, 10, true)).toBeNull();
	});
});
