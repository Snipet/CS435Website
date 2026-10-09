<!--
	The parser's result: the abstract syntax tree as an outline, and beside it
	a subtree drawn as a tree (the whole program when it is small, else the
	function or statement around the selection).
-->
<script lang="ts">
	import { ParseTreeView } from '$lib/components/grammar';
	import { pathKey } from '$lib/components/grammar/tree-layout';
	import { Disclosure } from '$lib/components/ui';
	import type { Compilation } from '$lib/theory/cminus';
	import AstOutline from './AstOutline.svelte';
	import DiagnosticList from './DiagnosticList.svelte';
	import GrammarText from './GrammarText.svelte';
	import { centerOn } from './reveal';
	import { nodeById, plural, rangeOf, type SelectionMarks, type SourceRange } from './selection';
	import {
		MAX_DRAWN,
		SMALL_TREE,
		drawingOf,
		drawnRoot,
		nodeCount,
		phaseDiagnostics
	} from './views';

	interface Props {
		c: Compilation;
		marks: SelectionMarks;
		selection: SourceRange | null;
		selKey?: string;
		/** Link that opens the BNF in Context-Free Grammars; null hides it. */
		grammarHref: string | null;
		onselect: (range: SourceRange) => void;
	}

	let { c, marks, selection, selKey = '', grammarHref, onselect }: Props = $props();

	const program = $derived(c.parse!.program);
	const diagnostics = $derived(phaseDiagnostics(c, 'parser'));
	const total = $derived(nodeCount(program));
	const drawing = $derived(drawingOf(drawnRoot(program, selection)));
	const current = $derived.by(() => {
		const paths: number[][] = [];
		for (const id of marks.nodes) {
			const path = drawing.paths.get(id);
			if (path) paths.push(path);
		}
		return paths;
	});

	function pick(path: number[]) {
		const id = drawing.ids.get(pathKey(path));
		const node = id === undefined ? undefined : nodeById(program, id);
		if (node) onselect(rangeOf(node.span));
	}
</script>

<div class="cm-stack">
	{#if diagnostics.length}
		<DiagnosticList {c} {diagnostics} label="Parser diagnostics" {onselect} />
		<p class="cm-note">
			The tree below holds what parsed: a statement or declaration with a syntax error is left out.
		</p>
	{/if}

	<div class="split">
		<section class="cm-section">
			<h3 class="cm-heading">
				Abstract syntax tree <span class="cm-sub">{plural(total, 'node')}</span>
			</h3>
			<AstOutline {program} marked={marks.nodes} {selKey} label="Abstract syntax tree" {onselect} />
		</section>

		<section class="cm-section">
			<h3 class="cm-heading">
				{drawing.caption}
				<span class="cm-sub">{plural(drawing.size, 'node')}</span>
			</h3>
			{#if drawing.tree}
				<!-- A wide tree scrolls in its box: its first marked node, or its root, starts in the middle. -->
				<div class="drawing" {@attach centerOn(`${selKey}/${drawing.root.id}`, ['.mark', '.node'])}>
					<ParseTreeView
						tree={drawing.tree}
						highlight={{ current }}
						onnodeclick={pick}
						ariaLabel="Syntax tree: {drawing.caption}"
						labelSize={14}
						minLabelSize={11}
					/>
				</div>
			{:else}
				<p class="cm-note">
					A tree of more than {MAX_DRAWN} nodes is not drawn. Select a statement in it to draw that statement.
				</p>
			{/if}
			<p class="cm-note cm-muted">
				{#if selection}
					The statement, declaration or function around the selection; its nodes are marked.
				{:else if total > SMALL_TREE}
					The program has more than {SMALL_TREE} nodes: its last function is drawn. A selection draws
					the statement or function around it.
				{:else}
					A selection draws the statement or function around it.
				{/if}
			</p>
		</section>
	</div>

	<Disclosure summary="Grammar" openSummary="Grammar" variant="boxed">
		<GrammarText href={grammarHref} level={3} />
	</Disclosure>
</div>

<style>
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		min-width: 0;
	}
	@container cm-view (min-width: 40rem) {
		.split {
			grid-template-columns: minmax(16rem, 5fr) minmax(0, 6fr);
			align-items: start;
		}
	}
	.drawing {
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
</style>
