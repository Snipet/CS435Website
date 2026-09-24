import type { Span } from './regex/ast';

/** A problem (or note) about user input, located by span when possible. */
export interface Diagnostic {
	severity: 'error' | 'warning' | 'info';
	message: string;
	span?: Span;
}

export const hasErrors = (ds: readonly Diagnostic[]): boolean =>
	ds.some((d) => d.severity === 'error');
