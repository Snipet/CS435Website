/**
 * Scrolls a scrollable box (not the page) so `el` is visible inside it,
 * below a sticky table header if the box has one. `also` is kept in view too
 * when both fit.
 */
export function revealInBox(box: HTMLElement, el: Element | null, also?: Element | null): void {
	if (!el) return;
	const pad = 6;
	const head = box.querySelector('thead');
	const headH = head instanceof HTMLElement ? head.offsetHeight : 0;
	const boxTop = box.getBoundingClientRect().top + box.clientTop;
	const span = (e: Element) => {
		const r = e.getBoundingClientRect();
		return { top: r.top - boxTop, bottom: r.bottom - boxTop };
	};
	let { top, bottom } = span(el);
	if (also) {
		const o = span(also);
		const both = { top: Math.min(top, o.top), bottom: Math.max(bottom, o.bottom) };
		if (both.bottom - both.top <= box.clientHeight - headH - 2 * pad) ({ top, bottom } = both);
	}
	if (top < headH + pad) box.scrollTop += top - headH - pad;
	else if (bottom > box.clientHeight - pad) box.scrollTop += bottom - box.clientHeight + pad;
}
