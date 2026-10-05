/**
 * Keeping what the step shown is about inside a box that scrolls (the list
 * of tries, a long token stream, a deep tree), without scrolling the page,
 * which `scrollIntoView` would do.
 */

/**
 * The scroll offset at which a row from `top` to `top + height` is inside a
 * box that shows `clientHeight` from `scrollTop`: unchanged when the row is in
 * view, else moved just far enough. A row taller than the box shows its top.
 * The same sum works sideways, with lefts and widths.
 */
export function scrollToShow(
	scrollTop: number,
	clientHeight: number,
	top: number,
	height: number
): number {
	if (top < scrollTop || height >= clientHeight) return Math.max(0, top);
	const bottom = top + height;
	if (bottom > scrollTop + clientHeight) return bottom - clientHeight;
	return scrollTop;
}

/**
 * The rows of a list of `total` that are drawn when at most `limit` are: the
 * last ones, since the list grows at its end and the step shown is there.
 * `hidden` rows before `start` are left out.
 */
export function tailWindow(total: number, limit: number): { start: number; hidden: number } {
	const start = Math.max(0, total - Math.max(1, Math.floor(limit)));
	return { start, hidden: start };
}

/** Scrolls `box` so that `row`, one of its children in the layout, is in view. */
export function showRow(box: HTMLElement, row: HTMLElement): void {
	// The box is the rows' offset parent (it is positioned).
	const next = scrollToShow(box.scrollTop, box.clientHeight, row.offsetTop, row.offsetHeight);
	if (next !== box.scrollTop) box.scrollTop = next;
}

/**
 * Scrolls `box`, and any box inside it that scrolls on its own (a wide tree),
 * so that `target` is in view with `margin` px around it. Nothing outside
 * `box` moves.
 */
export function reveal(box: HTMLElement, target: Element, margin = 12): void {
	for (let el = target.parentElement; el; el = el.parentElement) {
		const tall = el.scrollHeight > el.clientHeight + 1;
		const wide = el.scrollWidth > el.clientWidth + 1;
		if (tall || wide) {
			const t = target.getBoundingClientRect();
			const b = el.getBoundingClientRect();
			if (tall) {
				const top = t.top - b.top - el.clientTop + el.scrollTop - margin;
				const next = scrollToShow(el.scrollTop, el.clientHeight, top, t.height + 2 * margin);
				if (Math.abs(next - el.scrollTop) >= 1) el.scrollTop = next;
			}
			if (wide) {
				const left = t.left - b.left - el.clientLeft + el.scrollLeft - margin;
				const next = scrollToShow(el.scrollLeft, el.clientWidth, left, t.width + 2 * margin);
				if (Math.abs(next - el.scrollLeft) >= 1) el.scrollLeft = next;
			}
		}
		if (el === box) return;
	}
}

/**
 * The label of the current node of a ParseTreeView inside `box` (the view
 * draws that label with the class `current`), or null when no node is current.
 */
export const currentTreeNode = (box: HTMLElement): Element | null =>
	box.querySelector('.label.current');

/**
 * Room for four rows of a large TokenStream (58 px each with the pointer's
 * slot, 6 px apart); a longer stream scrolls in a box of this height.
 */
export const STREAM_HEIGHT = '15.875rem';

/**
 * The cell of token `index` of a TokenStream inside the box: the stream draws
 * one `.cell` per token and, with a pointer, one more for the end of the input.
 */
export const tokenCell =
	(index: number) =>
	(box: HTMLElement): Element | null =>
		box.querySelectorAll('.cell')[index] ?? null;

/**
 * Calls `adjust` again when the box changes size or the web fonts arrive:
 * both can change where lines wrap, and with it where the rows are. Returns
 * the cleanup.
 */
export function onReflow(box: HTMLElement, adjust: () => void): () => void {
	let live = true;
	const run = () => {
		if (live) adjust();
	};
	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
	observer?.observe(box);
	void document.fonts?.ready.then(run);
	return () => {
		live = false;
		observer?.disconnect();
	};
}
