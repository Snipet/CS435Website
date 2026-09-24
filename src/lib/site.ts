export const site = {
	name: 'CS435 Compiler Tools',
	shortName: 'CS435',
	description:
		'Interactive tools for CS435: regular expressions, finite automata, scanners, and the rest of the compiler pipeline.'
} as const;

export interface NavLink {
	href: '/';
	label: string;
}

export const navLinks: NavLink[] = [{ href: '/', label: 'Tools' }];
