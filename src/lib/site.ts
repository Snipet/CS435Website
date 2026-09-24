import { resolve } from '$app/paths';
import type { Pathname, ResolvedPathname } from '$app/types';

export const site = {
	name: 'CS435 Compiler Tools',
	shortName: 'CS435',
	description:
		'Interactive tools for CS435: regular expressions, finite automata, scanners, and the rest of the compiler pipeline.'
} as const;

export interface NavLink {
	href: '/' | '/notation';
	label: string;
}

export const navLinks: NavLink[] = [
	{ href: '/', label: 'Tools' },
	{ href: '/notation', label: 'Notation' }
];

/** Document title for a page: "Thompson's construction · CS435", or the site name. */
export function pageTitle(title?: string): string {
	return title ? `${title} · ${site.shortName}` : site.name;
}

/** Resolved link to a tool page from its slug (the tool's route folder). */
export function toolHref(slug: string): ResolvedPathname {
	// Tool routes are added one folder at a time, so a slug is only known to be a
	// route at runtime; this is the one place that asserts it.
	return resolve(`/${slug}` as Pathname);
}
