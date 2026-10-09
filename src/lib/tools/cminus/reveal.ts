/**
 * Bringing what belongs to the selection into view, inside the box that
 * scrolls (never the page).
 */
import type { Attachment } from 'svelte/attachments';

/** Class of every row, node and chip that belongs to the selection. */
export const MARKED = 'cm-marked';

/** Space kept between a revealed row and the edge of its box, in px. */
const PAD = 6;

export interface BlockPlace {
	/** Top of the first marked row and bottom of the last, measured from the top of the box's view. */
	top: number;
	bottom: number;
	/** Height of the box's view. */
	height: number;
	/** Height a sticky header covers at the top of the view. */
	head: number;
}

/**
 * How far to scroll a box so that a block of rows shows: 0 when it is in
 * view already; the least distance when it fits in the view; and for a block
 * taller than the view, the distance that puts its first row at the top, a
 * row of context above it.
 */
export function scrollDelta({ top, bottom, height, head }: BlockPlace): number {
	const first = head + PAD;
	const last = height - PAD;
	if (top >= first && bottom <= last) return 0;
	if (bottom - top <= last - first) return top < first ? top - first : bottom - last;
	const context = Math.min(24, Math.max(0, (last - first) / 4));
	return top - first - context;
}

/** Scrolls `box` (not the page) so the rows from `first` through `last` show. */
export function revealBlock(box: HTMLElement, first: Element, last: Element = first): void {
	const head = box.querySelector('thead');
	const origin = box.getBoundingClientRect().top + box.clientTop;
	const delta = scrollDelta({
		top: first.getBoundingClientRect().top - origin,
		bottom: last.getBoundingClientRect().bottom - origin,
		height: box.clientHeight,
		head: head instanceof HTMLElement ? head.offsetHeight : 0
	});
	if (delta !== 0) box.scrollTop += delta;
}

/**
 * For a box that scrolls: brings its marked rows into view when it is
 * created and whenever `key` (the selection) changes.
 */
export function revealMarked(key: unknown, selector = `.${MARKED}`): Attachment<HTMLElement> {
	return (box) => {
		if (key === null || key === undefined || key === '') return;
		const frame = requestAnimationFrame(() => {
			const marked = box.querySelectorAll(selector);
			if (marked.length) revealBlock(box, marked[0], marked[marked.length - 1]);
		});
		return () => cancelAnimationFrame(frame);
	};
}

/** The nearest element around `el`, inside `root`, whose content scrolls vertically. */
export function scrollBoxOf(el: Element, root: Element): HTMLElement | null {
	for (let p = el.parentElement; p && root.contains(p); p = p.parentElement) {
		const overflow = getComputedStyle(p).overflowY;
		if (overflow === 'auto' || overflow === 'scroll') return p;
	}
	return null;
}

/**
 * How far to scroll a box sideways so that the start of a range shows:
 * `left` and `right` are the edges of its first piece, measured from the left
 * edge of the view, `width` is the view's width and `margin` the room to keep
 * on the left (a sticky gutter). 0 when the piece is in view.
 */
export function sideDelta(left: number, right: number, width: number, margin: number): number {
	if (left >= margin && right <= width - PAD) return 0;
	return left - margin;
}

/** Scrolls the editor inside `root` (not the page) to the range drawn with `selector`. */
export function revealRange(root: HTMLElement, selector: string): void {
	const marked = root.querySelectorAll(selector);
	if (!marked.length) return;
	const box = scrollBoxOf(marked[0], root);
	if (!box) return;
	revealBlock(box, marked[0], marked[marked.length - 1]);
	// A long line: the start of the range, clear of the line numbers.
	const view = box.getBoundingClientRect();
	const piece = marked[0].getBoundingClientRect();
	const margin = Math.min(72, box.clientWidth / 3);
	const delta = sideDelta(
		piece.left - view.left - box.clientLeft,
		piece.right - view.left - box.clientLeft,
		box.clientWidth,
		margin
	);
	if (delta !== 0) box.scrollLeft += delta;
}

/** The nearest element around `el`, inside `root`, whose content scrolls sideways. */
function sideScrollBoxOf(el: Element, root: Element): HTMLElement | null {
	for (let p = el.parentElement; p && root.contains(p); p = p.parentElement) {
		const overflow = getComputedStyle(p).overflowX;
		if ((overflow === 'auto' || overflow === 'scroll') && p.scrollWidth > p.clientWidth + 1)
			return p;
	}
	return null;
}

/** Where to scroll a box of `width` so that the stretch from `left` to `right` of its content is centered. */
export function centered(left: number, right: number, width: number): number {
	return Math.max(0, (left + right) / 2 - width / 2);
}

/**
 * For the box around a drawing wider than its room: scrolls it sideways (not
 * the page) so that the first element matching one of `selectors` is in the
 * middle, when the box is created and whenever `key` changes. The drawing
 * may still be moving into place, so it is centered again once it has settled.
 */
export function centerOn(key: unknown, selectors: readonly string[]): Attachment<HTMLElement> {
	return (root) => {
		void key;
		const center = () => {
			let target: Element | null = null;
			for (const selector of selectors) {
				target = root.querySelector(selector);
				if (target) break;
			}
			const box = target ? sideScrollBoxOf(target, root) : null;
			if (!target || !box) return;
			const view = box.getBoundingClientRect();
			const at = target.getBoundingClientRect();
			box.scrollLeft = centered(
				at.left - view.left + box.scrollLeft,
				at.right - view.left + box.scrollLeft,
				box.clientWidth
			);
		};
		const frame = requestAnimationFrame(center);
		const timer = setTimeout(center, 320);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	};
}
