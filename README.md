# CS435 Compiler Tools

Interactive, browser-only tools for CS435 (compiler construction): regular expressions, finite
automata, scanners, and later the rest of the compiler pipeline.

The site is a fully static [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) app, prerendered with
`@sveltejs/adapter-static` and deployed to Cloudflare Pages.

## Development

```sh
npm install
npm run dev          # local dev server
npm run check        # svelte-check / TypeScript
npm run lint         # prettier + eslint
npm test             # vitest unit tests
npm run build        # static build into ./build
npm run preview      # serve the production build locally
```

## Deployment

The `cs435website` Cloudflare Pages project is connected to this GitHub repository:

- every branch and pull request gets a preview deployment, and
- every push to `main` deploys to production.

Build settings: command `npm run build`, output directory `build` (also set by
`pages_build_output_dir` in `wrangler.jsonc`, which Pages reads during builds). The Node
version comes from `.node-version`.

## Workflow

- Work happens on feature branches (`feat/…`, `fix/…`, `chore/…`) and lands on `main` through pull
  requests.
- CI (`.github/workflows/ci.yml`) runs lint, type-check, unit tests, and a production build on every
  PR.
- Each PR gets a Cloudflare Pages preview deployment; merging to `main` deploys production.

## Project layout

```
src/
  app.css                 design tokens (light/dark), base styles
  lib/
    site.ts               site metadata and navigation
    components/layout/    header, footer, theme toggle
  routes/                 pages (all prerendered)
static/_headers           Cloudflare Pages response headers
```
