<!--
	@component
	A small "Updating…" mark for a view whose results are being recomputed (see
	`WorkerTask`). It fades in after a short pause, so quick updates never show
	it. Beside the view it marks it is hidden from screen readers, which get
	`aria-busy` on the view instead; with `standalone` (a placeholder that is
	the only content, such as "Comparing…") the label is read as a status.
-->
<script lang="ts">
	interface Props {
		label?: string;
		/** The only content where it stands: read by screen readers as a status. */
		standalone?: boolean;
	}

	let { label = 'Updating…', standalone = false }: Props = $props();
</script>

<span
	class="updating"
	role={standalone ? 'status' : undefined}
	aria-hidden={standalone ? undefined : 'true'}
	><span class="dot" aria-hidden="true"></span>{label}</span
>

<style>
	.updating {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
		animation: appear var(--duration) var(--ease) 250ms both;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 0.9s ease-in-out infinite alternate;
	}
	@keyframes appear {
		from {
			opacity: 0;
		}
	}
	@keyframes pulse {
		from {
			opacity: 0.25;
		}
	}
</style>
