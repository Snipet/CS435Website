# CS435 Compiler Tools

Static SvelteKit (Svelte 5 runes, TypeScript) site of interactive tools for the CS435
compiler construction course. Read `docs/ARCHITECTURE.md` before changing anything: it
defines the notation canon (lecture fidelity), the engine API in `src/lib/theory/`, the
UI contracts, and the quality bar.

## Rules

- Site copy states what a tool does. It never describes the site's teaching purpose
  ("helps you understand", "learn by exploring", "build intuition", "common mistake", …).
- Presets cite lecture decks with `formatCitation` (deck title + slide). Never name the
  instructor or university.
- Engine code in `src/lib/theory/` is pure TS (no DOM, no Svelte) with unit tests next to
  it (`*.spec.ts`). User-input problems become `Diagnostic`s, not exceptions.
- Every route must prerender: no `window`/`document`/`localStorage` access at module top
  level; read the URL hash in `onMount` or `$effect`.
- Colors come from the tokens in `src/app.css`; both light and dark themes must work.

## Commands

`npm run dev` · `npm run lint` · `npm run check` · `npm test` · `npm run build`
(`npm run format` fixes Prettier issues.)

## Workflow

Feature branches (`feat/…`, `fix/…`, `chore/…`, `docs/…`) → PR → CI green → squash merge.
Cloudflare Pages (GitHub integration) builds a preview for every branch/PR and deploys
production on every push to `main`; there is no manual deploy step.
