/**
 * Line numbers of a code listing.
 */

/**
 * 1, 2, 3, … for the lines of the program as printed; lines the page
 * inserted (e.g. a `break;`) get null and do not shift the numbers after them.
 */
export function lineNumbers(lines: readonly { inserted?: boolean }[]): (number | null)[] {
	let n = 0;
	return lines.map((l) => (l.inserted ? null : ++n));
}
