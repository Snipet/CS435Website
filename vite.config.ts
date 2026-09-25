import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Cloudflare Pages serves 404.html for unknown paths; it renders src/routes/+error.svelte.
			adapter: adapter({ fallback: '404.html' }),
			prerender: {
				// Cross-tool links carry encoded tool state in the hash (`#v1.…`, see
				// url-state), not an element id. Every other missing anchor still fails.
				handleMissingId: ({ id, message }) => {
					if (/^v\d+\./.test(id)) return;
					throw new Error(message);
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		passWithNoTests: true,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
