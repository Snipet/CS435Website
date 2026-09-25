/** Server-renders the run's message list under the console. */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RunMessages from './RunMessages.svelte';
import { compileSpec } from './program';
import { runScanner } from './runtime';
import { runMessages } from './view';

const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

describe('RunMessages', () => {
	it('lists a warning that has no span (%option nodefault)', () => {
		const spec = '%option nodefault\n%%\na  { ECHO; }\n%%\n';
		const messages = runMessages(runScanner(compileSpec(spec), 'ab'), spec);
		const { body } = render(RunMessages, { props: { messages } });
		expect(text(body)).toBe(
			'Messages no rule matches "b" at line 1 and %option nodefault forbids the default rule'
		);
		expect(body).toContain('aria-label="Warning"');
		expect(body).not.toContain('<button');
	});

	it('shows the spec line of a spanned message, as a button when it can be revealed', () => {
		const spec = '%%\n<<EOF>>  { printf("end"); }\n%%\n';
		const messages = runMessages(runScanner(compileSpec(spec), ''), spec);
		expect(messages).toHaveLength(1);
		const linked = render(RunMessages, { props: { messages, onreveal: () => {} } }).body;
		expect(linked).toMatch(/<button[^>]*>spec\.l line 2<\/button>/);
		const plain = render(RunMessages, { props: { messages } }).body;
		expect(plain).not.toContain('<button');
		expect(text(plain)).toMatch(/spec\.l line 2$/);
	});

	it('renders nothing without messages', () => {
		expect(text(render(RunMessages, { props: { messages: [] } }).body)).toBe('');
	});
});
