/**
 * The page's two steppers and the steps of its share link (`step`,
 * `handleStep`; null = the last). A link's step goes to its stepper, and the
 * stepper's place goes back to the link, only while the parse shown is the
 * parse of the grammar and token string on the page: until a linked parse
 * arrives from the worker, the rows shown are another parse's, and a step
 * past their end would be cut back to it.
 */

/**
 * Where a stepper over `total` steps goes for the link's `step` (Stepper.set
 * clamps it); null: leave the stepper where it is.
 */
export function stepperIndex(step: number | null, total: number, current: boolean): number | null {
	if (!current || total <= 0) return null;
	return step === null ? total - 1 : step;
}

/**
 * The link's step for a stepper at `index` of `total` steps: null at the last
 * step; undefined: leave the link's step as it is.
 */
export function linkStep(
	index: number,
	total: number,
	current: boolean
): number | null | undefined {
	if (!current || total <= 0) return undefined;
	return index >= total - 1 ? null : index;
}
