<!--
	The two dispatches of the innermost call. 1: `accept` is virtual, so the
	class of the node, not the type of the pointer, picks the accept that
	runs (its code, with the line the step is on). 2: in it `this` has that
	class as its type, which picks the overload of IVisitor's `visit` (the
	interface, with that overload marked); `visit` is virtual, so the
	visitor's method for it runs.
-->
<script lang="ts">
	import { IVISITOR_CODE, withArticle } from '$lib/theory/cminus';
	import type { DispatchView } from './visitor-view';
	import VisitorCode from './VisitorCode.svelte';

	interface Props {
		view: DispatchView | null;
	}

	let { view }: Props = $props();

	const NONE: ReadonlySet<string> = new Set();
	const acceptCurrent = $derived(view?.line ? new Set([view.line]) : NONE);
	const acceptWaiting = $derived(
		view && (view.phase === 'body' || view.phase === 'return') ? new Set(['accept.visit']) : NONE
	);
	const overload = $derived(view ? new Set<string>([view.nodeClass]) : NONE);
</script>

{#if view}
	<ol class="dispatch">
		<li class={{ on: view.phase === 'accept' }}>
			<p class="head">
				<span class="n" aria-hidden="true">1</span>
				<code>{view.call}</code>
			</p>
			<ul class="types">
				<li><code>{view.variable}</code>: {withArticle(`${view.pointer}*`)}</li>
				<li>
					<span class="arrow" aria-hidden="true">→</span>the node: {withArticle(view.nodeClass)}
				</li>
				<li>
					<span class="arrow" aria-hidden="true">→</span><code>{view.nodeClass}::accept</code> runs
				</li>
			</ul>
			<VisitorCode
				lines={view.code}
				current={acceptCurrent}
				waiting={acceptWaiting}
				follow={false}
				wrap
				ariaLabel="{view.nodeClass}::accept"
			/>
		</li>
		<li class={{ on: view.phase === 'visit' }}>
			<p class="head">
				<span class="n" aria-hidden="true">2</span>
				<code>visitor->visit (this)</code>
			</p>
			<ul class="types">
				<li><code>this</code>: {withArticle(`${view.nodeClass}*`)}</li>
				<li>
					<span class="arrow" aria-hidden="true">→</span>overload
					<code>visit ({view.nodeClass}*)</code> of IVisitor
				</li>
				<li><span class="arrow" aria-hidden="true">→</span><code>{view.method}</code> runs</li>
			</ul>
			<VisitorCode
				lines={IVISITOR_CODE}
				current={view.phase === 'visit' ? overload : NONE}
				waiting={view.phase === 'visit' ? NONE : overload}
				maxHeight="13rem"
				wrap
				ariaLabel="IVisitor, the interface of the visitors"
			/>
		</li>
	</ol>
	{#if view.phase === 'return'}
		<p class="cm-note cm-muted">Both calls return.</p>
	{/if}
{/if}

<style>
	.dispatch {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 0;
	}
	.dispatch > li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	p {
		margin: 0;
		min-width: 0;
	}
	code {
		padding: 0;
		border: 0;
		background: none;
		font-size: 0.78125rem;
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.head code {
		font-weight: 600;
	}
	.types {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0 0 0 calc(1.4rem + var(--space-2));
		list-style: none;
		color: var(--text-2);
		font-size: var(--text-xs);
		line-height: 1.6;
	}
	.types code {
		font-size: 0.75rem;
	}
	.arrow {
		margin-right: 0.4em;
		color: var(--text-3);
	}
	.n {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.types li {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	li.on .n {
		background: var(--info);
		color: var(--surface);
	}
	li.on .types {
		color: var(--text);
	}
</style>
