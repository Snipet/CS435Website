<!-- An editable list of names (source languages or target ISAs) shown as chips. -->
<script lang="ts">
	import { Button, Icon } from '$lib/components/ui';
	import { addEnd, MAX_END_NAME, MAX_ENDS } from './architecture';

	interface Props {
		/** Visible heading, e.g. "Languages". */
		title: string;
		/** Singular noun for labels, e.g. "language". */
		noun: string;
		items: string[];
		placeholder?: string;
	}

	let { title, noun, items = $bindable(), placeholder = '' }: Props = $props();

	const uid = $props.id();
	let draft = $state('');
	let error = $state('');

	function add() {
		const next = addEnd(items, draft);
		if (!next.ok) {
			error = draft.trim() ? next.error : '';
			return;
		}
		items = next.list;
		draft = '';
		error = '';
	}
</script>

<div class="end-list" role="group" aria-labelledby="{uid}-title">
	<h3 id="{uid}-title">{title} <span class="count">{items.length}</span></h3>
	<ul class="chips">
		{#each items as name, i (name)}
			<li class="chip">
				<span class="name">{name}</span>
				<button
					type="button"
					class="remove"
					aria-label="Remove {noun} {name}"
					title={items.length <= 1 ? `At least one ${noun} is needed` : `Remove ${name}`}
					disabled={items.length <= 1}
					onclick={() => items.splice(i, 1)}
				>
					<Icon name="x" size={12} />
				</button>
			</li>
		{/each}
	</ul>
	<form
		class="add"
		onsubmit={(e) => {
			e.preventDefault();
			add();
		}}
	>
		<label class="visually-hidden" for="{uid}-input">New {noun}</label>
		<input
			id="{uid}-input"
			type="text"
			bind:value={draft}
			oninput={() => (error = '')}
			{placeholder}
			maxlength={MAX_END_NAME}
			autocomplete="off"
			disabled={items.length >= MAX_ENDS}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${uid}-err` : undefined}
		/>
		<Button type="submit" size="sm" disabled={items.length >= MAX_ENDS}>
			{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
			Add
		</Button>
	</form>
	{#if error}<p class="error" id="{uid}-err" role="status">{error}</p>{/if}
</div>

<style>
	.end-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-3);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.count {
		min-width: 20px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0;
		text-align: center;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 28px;
		padding: 0 3px 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		font-size: var(--text-sm);
	}
	.remove {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
	}
	.remove:hover:not(:disabled) {
		background: var(--surface-3);
		color: var(--text);
	}
	.remove:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.add {
		display: flex;
		gap: var(--space-2);
		max-width: 18rem;
	}
	input {
		flex: 1;
		min-width: 0;
		height: 30px;
		padding: 0 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
	}
	input::placeholder {
		color: var(--text-3);
	}
	input:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	input[aria-invalid='true'] {
		border-color: var(--reject);
	}
	input:disabled {
		opacity: 0.5;
	}
	.error {
		margin: 0;
		color: var(--reject);
		font-size: var(--text-xs);
	}
</style>
