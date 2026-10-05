/**
 * How GrammarEditor edits its textarea, apart from the DOM: a palette button
 * inserts a symbol, and a `->` in the text becomes `→`. Both go through the
 * browser's `insertText` command, which keeps the undo history.
 *
 * The command fires the field's `input` event before it returns, and a browser
 * refuses a command given while another one is running. So an edit made with
 * the command is never rewritten from inside its own `input` event: the arrows
 * are converted after the command has returned.
 */
import { convertArrows, paletteInsertion, type ArrowConversion } from './grammar-text';

/** What the editor needs of its textarea; an `HTMLTextAreaElement` fits. */
export interface GrammarField {
	readonly value: string;
	readonly selectionStart: number | null;
	readonly selectionEnd: number | null;
	focus(): void;
	setSelectionRange(start: number, end: number): void;
}

/** The parts of an `InputEvent` that decide whether an edit may be rewritten. */
export interface EditInfo {
	inputType?: string;
	isComposing?: boolean;
}

export interface GrammarInputHost {
	field(): GrammarField | null | undefined;
	/**
	 * Replaces the field's selection the way typing does
	 * (`document.execCommand('insertText', false, text)`). False when the
	 * browser did not do it.
	 */
	insertText(text: string): boolean;
	/**
	 * Sets the whole text and resolves once the field shows it. Used when
	 * `insertText` fails; the browser's undo history does not survive it.
	 */
	setText(text: string): Promise<void>;
	readonly(): boolean;
	ebnf(): boolean;
	/** The text after an edit, with its arrows converted. */
	oninput(value: string): void;
}

export interface GrammarInput {
	/** Records what kind of edit an `input` event is. Call it before `input`. */
	note(edit: EditInfo): void;
	/** The field's `input` event: converts `->`, then reports the text. */
	input(next: string): Promise<void>;
	/** A palette button: inserts `symbol` over the selection, with the spaces around it. */
	insert(symbol: string): Promise<void>;
}

export function createGrammarInput(host: GrammarInputHost): GrammarInput {
	// Undo and redo are not rewritten (undoing a conversion would convert
	// again), nor is text an input method is composing.
	let lastEdit = { history: false, composing: false };
	/** An `insertText` command given from here is running. */
	let running = false;

	function command(text: string): boolean {
		running = true;
		try {
			return host.insertText(text);
		} finally {
			running = false;
		}
	}

	/** Replaces each `->` in the field and puts the caret back where it was. */
	async function applyArrows(field: GrammarField, result: ArrowConversion) {
		// From the last one, so the ranges before it stay where they are.
		let done = true;
		for (let k = result.ranges.length - 1; k >= 0 && done; k--) {
			field.setSelectionRange(result.ranges[k].start, result.ranges[k].end);
			done = command('→');
		}
		if (field.value !== result.text) await host.setText(result.text);
		field.setSelectionRange(result.caret, result.caret);
	}

	/** Converts the arrows of the text now in the field, then reports it. */
	async function settle(field: GrammarField, next: string) {
		if (!host.readonly() && !lastEdit.history && !lastEdit.composing) {
			const caret = field.selectionStart ?? next.length;
			const result = convertArrows(next, caret, { ebnf: host.ebnf() });
			if (result.changed) {
				await applyArrows(field, result);
				host.oninput(field.value);
				return;
			}
		}
		host.oninput(next);
	}

	return {
		note(edit) {
			lastEdit = {
				history: (edit.inputType ?? '').startsWith('history'),
				composing: edit.isComposing === true
			};
		},

		async input(next) {
			// The event of a command given from here: whoever gave it carries on
			// once it has returned.
			if (running) return;
			const field = host.field();
			if (field) await settle(field, next);
			else host.oninput(next);
		},

		async insert(symbol) {
			const field = host.field();
			if (!field || host.readonly()) return;
			const before = field.value;
			const start = field.selectionStart ?? before.length;
			const end = field.selectionEnd ?? start;
			const text = paletteInsertion(symbol, before, start, end);
			field.focus();
			field.setSelectionRange(start, end);
			if (command(text)) {
				// Its `input` event was left alone above; the arrows are converted now.
				lastEdit = { history: false, composing: false };
				await settle(field, field.value);
				return;
			}
			const result = convertArrows(
				before.slice(0, start) + text + before.slice(end),
				start + text.length,
				{ ebnf: host.ebnf() }
			);
			await host.setText(result.text);
			field.setSelectionRange(result.caret, result.caret);
			host.oninput(result.text);
		}
	};
}
