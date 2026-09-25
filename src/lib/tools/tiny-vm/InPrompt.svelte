<script lang="ts">
	import { Button } from '$lib/components/ui';
	import { parseInteger } from './input';
	import { formatInstruction, type WaitRecord } from './machine';
	import { IN_PROMPT } from './trace';

	interface Props {
		wait: WaitRecord;
		/** A run stopped here and continues after the value. */
		resumes: boolean;
		onsubmit: (value: number) => void;
		/** The text field, for focusing. */
		element?: HTMLInputElement;
	}

	let { wait, resumes, onsubmit, element = $bindable() }: Props = $props();

	const uid = $props.id();
	let text = $state('');
	let error = $state(false);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const value = parseInteger(text);
		if (value === null) {
			error = true;
			return;
		}
		error = false;
		text = '';
		onsubmit(value);
	}
</script>

<form class="prompt" onsubmit={submit} aria-labelledby="{uid}-title">
	<p class="title" id="{uid}-title">
		<code>{wait.pc}: {formatInstruction(wait.instr)}</code> is waiting for a value for reg[{wait.r}]
	</p>
	<div class="row">
		<label class="label" for="{uid}-value">{IN_PROMPT.trim()}</label>
		<input
			bind:this={element}
			bind:value={text}
			id="{uid}-value"
			class="value"
			type="text"
			inputmode="numeric"
			autocomplete="off"
			spellcheck="false"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby="{uid}-hint{error ? ` ${uid}-err` : ''}"
			oninput={() => (error = false)}
		/>
		<Button type="submit" size="sm" variant="primary">Enter</Button>
	</div>
	<p class="hint" id="{uid}-hint">
		The value is added to the input values{resumes ? ', and the run continues' : ''}.
	</p>
	{#if error}
		<p class="error" id="{uid}-err" role="alert">Illegal value: type an integer, such as 3.</p>
	{/if}
</form>

<style>
	.prompt {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid color-mix(in srgb, var(--active) 45%, transparent);
		border-left: 3px solid var(--active);
		border-radius: var(--radius);
		background: var(--active-soft);
	}
	.title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.label {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	.value {
		width: 8rem;
		height: 30px;
		padding: 0 8px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-ligatures: none;
	}
	.value:focus-visible {
		border-color: var(--accent);
		outline-offset: 1px;
	}
	.value[aria-invalid='true'] {
		border-color: var(--reject);
	}
	.hint {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.error {
		margin: 0;
		color: var(--reject);
		font-size: var(--text-xs);
	}
</style>
