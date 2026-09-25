<script lang="ts">
	import { untrack } from 'svelte';
	import PresetMenu from '$lib/components/ui/PresetMenu.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import ToolPage from '$lib/components/ui/ToolPage.svelte';
	import { syncToHash } from '$lib/url-state';
	import type { TokenRule } from '$lib/theory/automata';
	import { tool } from '$lib/tools/catalog/scanner-dfa';
	import SizesTab from '$lib/tools/scanner-dfa/SizesTab.svelte';
	import SwitchTab from '$lib/tools/scanner-dfa/SwitchTab.svelte';
	import TableDrivenTab from '$lib/tools/scanner-dfa/TableDrivenTab.svelte';
	import { PRESETS, matchPreset, type ScannerPreset } from '$lib/tools/scanner-dfa/presets';
	import {
		buildRuleDfa,
		compileRules,
		minimalRuleDfa,
		nameGroups,
		structureKey,
		withTokenNames,
		type RuleDfas
	} from '$lib/tools/scanner-dfa/rules';
	import {
		DEFAULT_STATE,
		isSavedState,
		loadState,
		type ScannerDfaState,
		type TabId
	} from '$lib/tools/scanner-dfa/state';

	/** Wait after the last edit of the definitions or an RE before building the DFA again (ms). */
	const BUILD_DELAY = 250;

	let model = $state<ScannerDfaState>(loadState(DEFAULT_STATE, {}));
	syncToHash(() => model, {
		onLoad: (v) => {
			Object.assign(model, loadState(DEFAULT_STATE, v));
			settle();
		},
		validate: isSavedState
	});

	// Parsing is cheap and runs on every edit; building the DFA waits for a pause in typing.
	const compiled = $derived(compileRules(model.defs, model.rules));
	const hasRules = $derived(compiled.rules !== null);

	interface Build {
		/** `structureKey`: the definitions and REs the DFA is built from. */
		key: string;
		rules: TokenRule[];
	}

	const latest = $derived.by((): Build | null =>
		compiled.rules ? { key: structureKey(model.defs, model.rules), rules: compiled.rules } : null
	);
	let settled = $state.raw<Build | null>(untrack(() => latest));
	/** The definitions or an RE changed and the DFA shown is from before the change. */
	const stale = $derived(latest !== null && latest.key !== settled?.key);

	/** Builds from the current rules now (a preset or a link was loaded). */
	function settle() {
		if (latest) settled = latest;
	}

	$effect(() => {
		const next = latest;
		if (!next || next.key === untrack(() => settled?.key)) return;
		const timer = setTimeout(() => (settled = next), BUILD_DELAY);
		return () => clearTimeout(timer);
	});

	const raw = $derived(settled ? buildRuleDfa(settled.rules) : null);

	// Names and drop flags do not change the DFA: the tokens are renamed by rule index. These
	// keys are strings, so the steps after them only run again when the names really change.
	const namesKey = $derived(
		JSON.stringify(
			(stale || !compiled.rules ? (settled?.rules ?? []) : compiled.rules).map((r) => r.name)
		)
	);
	const groupsKey = $derived(JSON.stringify(nameGroups(JSON.parse(namesKey))));
	const needMinimal = $derived(model.minimal || model.tab === 'sizes');
	const minimalRaw = $derived(
		needMinimal && raw?.ok ? minimalRuleDfa(raw.full, JSON.parse(groupsKey)) : null
	);
	const full = $derived(raw?.ok ? withTokenNames(raw.full, JSON.parse(namesKey)) : null);
	const minimal = $derived(minimalRaw ? withTokenNames(minimalRaw, JSON.parse(namesKey)) : null);
	const built = $derived.by((): RuleDfas | null => {
		if (!hasRules || !raw) return null;
		if (!raw.ok) return raw;
		return { ok: true, full: full!, minimal };
	});

	/** The definitions that name character sets, kept while they stay the same. */
	const namedSetsKey = $derived(compiled.names.map((n) => `${n.name}=${n.set.key()}`).join('\n'));
	const namedSets = $derived.by(() => {
		void namedSetsKey;
		return untrack(() => compiled.names);
	});

	const preset = $derived(matchPreset(model));

	function applyPreset(p: ScannerPreset) {
		if (p.value.source !== 'relop' && model.tab === 'switch') model.tab = 'table';
		Object.assign(model, loadState(model, p.value));
		settle();
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

	<Tabs tabs={TABS} bind:value={model.tab} label="Scanner DFA views">
		{#snippet children(id)}
			{#if id === 'table'}
				<TableDrivenTab bind:model {compiled} {built} names={namedSets} {preset} />
			{:else if id === 'switch'}
				<SwitchTab bind:model />
			{:else}
				<SizesTab {model} {built} names={namedSets} />
			{/if}
		{/snippet}
	</Tabs>
</ToolPage>
