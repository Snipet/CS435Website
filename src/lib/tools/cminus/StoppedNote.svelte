<!--
	Shown in a tab whose phase was not reached: which phase stopped the
	compilation, and a button that opens that phase's tab.
-->
<script lang="ts">
	import { Button, Callout } from '$lib/components/ui';
	import type { Compilation, Phase } from '$lib/theory/cminus';
	import type { TabId } from './state';
	import { PHASE_TAB, TAB_LABEL, stoppedText } from './views';

	interface Props {
		c: Compilation;
		/** The phase that stopped the compilation. */
		phase: Phase;
		/** What this tab would show: "three-address code". */
		what: string;
		onopen: (tab: TabId) => void;
	}

	let { c, phase, what, onopen }: Props = $props();

	const tab = $derived(PHASE_TAB[phase]);
</script>

<Callout tone="warn" title="Not reached">
	<p>{stoppedText(c)} There is no {what} to show.</p>
	<Button size="sm" onclick={() => onopen(tab)}>Open {TAB_LABEL[tab]}</Button>
</Callout>
