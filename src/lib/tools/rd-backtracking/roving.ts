/**
 * One tab stop for a list of rows that are buttons (the tries, the calls):
 * Tab enters the list at one row, and the arrow keys, Home and End move
 * between the rows.
 */

/**
 * The row that takes the focus when `key` is pressed on row `at` of `count`
 * rows, or null when the key is not one of the list's.
 */
export function rovingTarget(key: string, at: number, count: number): number | null {
	if (count <= 0) return null;
	switch (key) {
		case 'ArrowDown':
			return Math.min(count - 1, at + 1);
		case 'ArrowUp':
			return Math.max(0, at - 1);
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return null;
	}
}

/**
 * The row with the tab stop: the row that had the focus last while it is
 * still listed, else the row of the step shown, else the newest row. Rows are
 * named by a number (the step or the call they stand for); null for no rows.
 */
export function tabStop(
	rows: readonly { id: number; current: boolean }[],
	focused: number | null
): number | null {
	if (rows.length === 0) return null;
	if (focused !== null && rows.some((r) => r.id === focused)) return focused;
	return (rows.findLast((r) => r.current) ?? rows[rows.length - 1]).id;
}

/** Moves the focus between the `button.row` elements of `list` for a key pressed on one of them. */
export function moveFocus(event: KeyboardEvent, list: HTMLElement | undefined): void {
	if (!list || event.ctrlKey || event.metaKey || event.altKey) return;
	const rows = [...list.querySelectorAll<HTMLElement>('button.row')];
	const at = rows.indexOf(event.currentTarget as HTMLElement);
	if (at < 0) return;
	const next = rovingTarget(event.key, at, rows.length);
	if (next === null) return;
	event.preventDefault();
	rows[next].focus();
}
