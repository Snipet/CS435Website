<script lang="ts">
	import PresetMenu from '$lib/components/ui/PresetMenu.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import ToolPage from '$lib/components/ui/ToolPage.svelte';
	import { syncToHash } from '$lib/url-state';
	import { tool } from '$lib/tools/catalog/scanner-dfa';
	import SizesTab from '$lib/tools/scanner-dfa/SizesTab.svelte';
	import SwitchTab from '$lib/tools/scanner-dfa/SwitchTab.svelte';
	import TableDrivenTab from '$lib/tools/scanner-dfa/TableDrivenTab.svelte';
	import { PRESETS, matchPreset, type ScannerPreset } from '$lib/tools/scanner-dfa/presets';
	import { buildRuleDfa, compileRules } from '$lib/tools/scanner-dfa/rules';
	import {
		DEFAULT_STATE,
		isSavedState,
		loadState,
		type ScannerDfaState,
		type TabId
	} from '$lib/tools/scanner-dfa/state';

	let state = $state<ScannerDfaState>(loadState(DEFAULT_STATE, {}));
	syncToHash(() => state, {
		onLoad: (v) => Object.assign(state, loadState(DEFAULT_STATE, v)),
		validate: isSavedState
	});

	const compiled = $derived(compileRules(state.defs, state.rules));
	const built = $derived(compiled.rules ? buildRuleDfa(compiled.rules, { minimal: false }) : null);
	const preset = $derived(matchPreset(state));

	function applyPreset(p: ScannerPreset) {
		if (p.value.source !== 'relop' && state.tab === 'switch') state.tab = 'table';
		Object.assign(state, loadState(state, p.value));
	}

	const TABS: { id: TabId; label: string }[] = [
		{ id: 'table', label: 'Table-driven' },
		{ id: 'switch', label: 'Hand-coded switch' },
		{ id: 'sizes', label: 'Sizes' }
	];
</script>

<ToolPage {tool}>
	{#snippet actions()}
		<PresetMenu
			presets={PRESETS}
			selected={preset?.id ?? null}
			onselect={applyPreset}
			align="end"
		/>
	{/snippet}

	<Tabs tabs={TABS} bind:value={state.tab} label="Scanner DFA views">
		{#snippet children(id)}
			{#if id === 'table'}
				<TableDrivenTab bind:model={state} {compiled} {built} {preset} />
			{:else if id === 'switch'}
				<SwitchTab bind:model={state} />
			{:else}
				<SizesTab model={state} {compiled} {built} />
			{/if}
		{/snippet}
	</Tabs>
</ToolPage>
