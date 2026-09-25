/** The "Updating…" mark: hidden from screen readers beside a view, read as a status alone. */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Updating from './Updating.svelte';

describe('Updating', () => {
	it('is hidden from screen readers beside a view that carries aria-busy', () => {
		const { body } = render(Updating);
		expect(body).toContain('Updating…');
		expect(body).toMatch(/class="updating[^"]*"[^>]*aria-hidden="true"/);
		expect(body).not.toContain('role="status"');
	});

	it('is read as a status when it is the only content', () => {
		const { body } = render(Updating, { props: { label: 'Comparing…', standalone: true } });
		expect(body).toContain('Comparing…');
		expect(body).toMatch(/class="updating[^"]*"[^>]*role="status"/);
		// Only the decorative dot is hidden.
		expect(body.match(/aria-hidden="true"/g)).toHaveLength(1);
		expect(body).toMatch(/class="dot[^"]*" aria-hidden="true"/);
	});
});
