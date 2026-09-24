import type { Diagnostic } from '$lib/theory/diagnostics';

/**
 * One line for screen readers about a field's problems: the first error (or,
 * when there are none, the first warning) and how many more of that kind
 * there are. Notes are not announced. `''` when there is nothing to report.
 * `where` can add a location, e.g. `line 3`.
 */
export function summarizeDiagnostics(
	diagnostics: readonly Diagnostic[],
	where?: (d: Diagnostic) => string | null
): string {
	const errors = diagnostics.filter((d) => d.severity === 'error');
	const list = errors.length ? errors : diagnostics.filter((d) => d.severity === 'warning');
	if (!list.length) return '';
	const first = list[0];
	const at = where?.(first);
	const kind = first.severity === 'error' ? 'Error' : 'Warning';
	const more = list.length > 1 ? ` (${list.length - 1} more)` : '';
	return `${kind}${at ? ` on ${at}` : ''}: ${first.message}${more}`;
}

/** What a live region says when a field's summary goes from `before` to `after`. */
export function announcementFor(before: string, after: string): string {
	return after || (before ? 'No problems' : '');
}
