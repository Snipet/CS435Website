import type { Attachment } from 'svelte/attachments';

/** Set on a box while it scrolls; the page's step shortcuts leave its keys alone. */
export const SCROLL_REGION_ATTR = 'data-scroll-region';

/** Whether a box's content is larger than the box (with a pixel of slack for rounding). */
export function overflows(box: {
	scrollWidth: number;
	clientWidth: number;
	scrollHeight: number;
	clientHeight: number;
}): boolean {
	return box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
}

/**
 * A box with `overflow: auto` becomes a tab stop while its content overflows
 * it, so the arrow, Page and Home/End keys can scroll it; a box whose content
 * fits gets no tab stop. The box needs its own role and label. A box that has
 * focus keeps its tab stop until focus leaves it.
 */
export const scrollRegion: Attachment<HTMLElement> = (el) => {
	const update = () => {
		if (overflows(el)) {
			el.tabIndex = 0;
			el.setAttribute(SCROLL_REGION_ATTR, '');
		} else if (document.activeElement !== el) {
			el.removeAttribute('tabindex');
			el.removeAttribute(SCROLL_REGION_ATTR);
		}
	};

	// The box and its content can each change size on their own (window width,
	// fonts, rows added or removed).
	const resize = new ResizeObserver(update);
	let content: Element | null = null;
	const watchContent = () => {
		const first = el.firstElementChild;
		if (first === content) return;
		if (content) resize.unobserve(content);
		content = first;
		if (content) resize.observe(content);
	};
	const mutation = new MutationObserver(() => {
		watchContent();
		update();
	});

	resize.observe(el);
	watchContent();
	mutation.observe(el, { childList: true, subtree: true, characterData: true });
	el.addEventListener('blur', update);
	update();

	return () => {
		resize.disconnect();
		mutation.disconnect();
		el.removeEventListener('blur', update);
	};
};
