import type { Attachment } from 'svelte/attachments';

/**
 * A box that scrolls sideways (a wide tree, table, or listing) becomes a
 * focusable, labeled region while its content is wider than the box, so the
 * arrow keys can scroll it; a box whose content fits gets no tab stop.
 */
export function scrollRegion(label: string): Attachment<HTMLElement> {
	return (el) => {
		const update = () => {
			if (el.scrollWidth > el.clientWidth + 1) {
				el.tabIndex = 0;
				el.setAttribute('role', 'region');
				el.setAttribute('aria-label', label);
			} else {
				el.removeAttribute('tabindex');
				el.removeAttribute('role');
				el.removeAttribute('aria-label');
			}
		};
		update();
		// The box and its content: either can change size on its own.
		const observer = new ResizeObserver(update);
		observer.observe(el);
		for (const child of Array.from(el.children)) observer.observe(child);
		return () => observer.disconnect();
	};
}
