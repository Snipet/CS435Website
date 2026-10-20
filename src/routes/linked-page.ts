/**
 * For the specs of the tool pages: a page rendered on the server as it opens
 * on a link, and the links it shows. In the browser a page loads the state in
 * its URL hash on mount, which the server never runs. `openingOn` stands in
 * for `$lib/url-state`: its `syncToHash` puts `page.state` into the page's
 * state at once, as the page's `onLoad` does with the state its tool's
 * `stateFromHash` makes of the link. In a spec:
 *
 * ```ts
 * const page = vi.hoisted(() => ({ state: null as object | null }));
 * vi.mock('$lib/url-state', async (real) =>
 * 	(await import('../linked-page')).openingOn(await real(), page)
 * );
 * // …
 * page.state = stateFromHash(link);
 * const html = render(Page).body;
 * ```
 *
 * Not a route: SvelteKit only reads the `+` files of this folder.
 */
import type * as UrlState from '$lib/url-state';
// The module behind `$lib/url-state`, which a spec mocks: this one is never mocked.
import { decode } from '$lib/url-state.svelte';

/**
 * `$lib/url-state` with a `syncToHash` that assigns `page.state` to the
 * page's state (what its getter returns) when the page calls it; null leaves
 * the page as it opens without a hash.
 */
export function openingOn(real: typeof UrlState, page: { state: object | null }): typeof UrlState {
	return {
		...real,
		syncToHash<T>(get: () => T): void {
			if (page.state) Object.assign(get() as object, page.state);
		}
	};
}

const unescape = (text: string) =>
	text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');

/** Rendered HTML as it reads: comments and tags dropped, white space collapsed. */
export function readText(html: string): string {
	return unescape(html.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();
}

/** The inner HTML of each `<p>` whose classes include `name`, in page order. */
export function paragraphs(html: string, name: string): string[] {
	return [...html.matchAll(/<p class="([^"]*)"[^>]*>(.*?)<\/p>/gs)]
		.filter(([, classes]) => classes.split(/\s+/).includes(name))
		.map(([, , inner]) => inner);
}

export interface PageLink {
	text: string;
	/** The tool's slug: the path without its slash. */
	slug: string;
	/** The state the hash carries. */
	state: unknown;
}

/** The links in `html` that open a tool on a state (`/slug#v1.…`), in order. */
export function toolLinks(html: string): PageLink[] {
	return [...html.matchAll(/<a\b[^>]*\bhref="\/([\w-]+)#([^"]+)"[^>]*>(.*?)<\/a>/gs)].map(
		([, slug, hash, inner]) => ({
			text: readText(inner),
			slug,
			state: decode(unescape(hash))
		})
	);
}
