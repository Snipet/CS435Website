// Shared UI kit. See docs/ARCHITECTURE.md §5.3.
export { default as Badge } from './Badge.svelte';
export { default as Button } from './Button.svelte';
export { default as Callout } from './Callout.svelte';
export { default as CharStream } from './CharStream.svelte';
export { default as CitationTag } from './CitationTag.svelte';
export { default as CodeEditor } from './CodeEditor.svelte';
export { default as CopyLinkButton } from './CopyLinkButton.svelte';
export { default as Disclosure } from './Disclosure.svelte';
export { default as Icon, type IconName } from './Icon.svelte';
export { default as IconButton } from './IconButton.svelte';
export { default as Kbd } from './Kbd.svelte';
export { default as NumberField } from './NumberField.svelte';
export { default as Panel } from './Panel.svelte';
export { default as PresetMenu } from './PresetMenu.svelte';
export { default as RegexField, DEFAULT_SYMBOLS, type PaletteSymbol } from './RegexField.svelte';
export { default as SegmentedControl } from './SegmentedControl.svelte';
export { default as Select } from './Select.svelte';
export { default as StepControls } from './StepControls.svelte';
export { default as StringSetView } from './StringSetView.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as TextField } from './TextField.svelte';
export { default as Toggle } from './Toggle.svelte';
export { default as TokenPairs } from './TokenPairs.svelte';
export { default as ToolPage } from './ToolPage.svelte';
export { default as Updating } from './Updating.svelte';

export {
	Stepper,
	stepperKeys,
	clampIndex,
	keyToCommand,
	DEFAULT_SPEED,
	type StepCommand
} from './stepper.svelte';
export {
	WorkerTask,
	DEFAULT_RESTART_AFTER,
	DEFAULT_TIME_LIMIT,
	type TaskStatus,
	type WorkerTaskOptions
} from './worker-task.svelte';
export type { TaskWorker } from './worker-protocol';
export { applyAliases, DEFAULT_ALIASES } from './regex-aliases';
export { formatLexeme, formatTokenPair, type TokenFormat } from './token-format';
export { toneColors, toneStyle, paletteIndex } from './tones';
export type {
	HighlightRange,
	HighlightToken,
	Preset,
	SemanticTone,
	Size,
	Tone,
	TokenPair
} from './types';
