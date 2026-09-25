<!--
	@component
	A small "Updating…" mark for a view whose results are being recomputed (see
	`WorkerTask`). It fades in after a short pause, so quick updates never show
	it. Screen readers get `aria-busy` on the view instead.
-->
<script lang="ts">
	interface Props {
		label?: string;
	}

	let { label = 'Updating…' }: Props = $props();
</script>

<span class="updating" aria-hidden="true"><span class="dot"></span>{label}</span>

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
