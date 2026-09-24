<!--
	Visually hidden live region for a field's problems. Speaks `summary` once
	typing pauses, and "No problems" when it clears. The summary a field starts
	with is not spoken (it is read with the field, via aria-describedby).
-->
<script lang="ts">
	import { announcementFor } from './diagnostic-summary';

	interface Props {
		/** From `summarizeDiagnostics`. */
		summary: string;
		/** Quiet time before speaking, in ms. */
		delay?: number;
	}

	let { summary, delay = 700 }: Props = $props();

	let spoken = $state('');
	// The summary as of the last announcement; undefined until the first run.
	let settled: string | undefined;

	$effect(() => {
		const text = summary;
		if (settled === undefined) {
			settled = text;
			return;
		}
		const timer = setTimeout(() => {
			if (text !== settled) spoken = announcementFor(settled ?? '', text);
			settled = text;
		}, delay);
		return () => clearTimeout(timer);
	});
</script>

<span class="visually-hidden" role="status">{spoken}</span>
