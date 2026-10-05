<!--
	The verdict line for the trees of one string: "1 parse tree", "2 parse trees:
	the grammar is ambiguous", "No parse tree: the grammar does not generate the
	string". Announced when it changes.
-->
<script lang="ts">
	import { toneColors } from '$lib/components/ui';
	import { countText, verdictNote, verdictTone, type Listing } from './model';

	interface Props {
		listing: Pick<Listing, 'trees' | 'total'>;
		/** What the trees belong to: "the grammar", "the rewritten grammar". */
		what?: string;
		/** A further sentence after the verdict. */
		more?: string;
	}

	let { listing, what = 'the grammar', more = '' }: Props = $props();

	const note = $derived(verdictNote(listing, what));
	const color = $derived(toneColors(verdictTone(listing)).fg);
</script>

<p class="verdict" role="status">
	<span class="dot" style="background: {color}" aria-hidden="true"></span>
	<span
		><strong>{countText(listing)}</strong>{note ? `: ${note}` : ''}{more ? `. ${more}` : ''}</span
	>
</p>

<style>
	.verdict {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
	}
	.dot {
		flex: none;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		transform: translateY(-1px);
	}
	strong {
		font-weight: 600;
	}
</style>
