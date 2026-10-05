import { describe, expect, it } from 'vitest';
import {
	createGrammarInput,
	type EditInfo,
	type GrammarField,
	type GrammarInput
} from './grammar-input';

interface Snapshot {
	value: string;
	start: number;
	end: number;
}

/**
 * A textarea as the editor sees one, with the browser behavior it depends on:
 * `insertText` fires `input` before it returns, a command given while another
 * one runs is refused, and setting the whole text empties the undo history.
 */
class FakeField implements GrammarField {
	value: string;
	selectionStart: number;
	selectionEnd: number;
	focused = false;
	/** Whether the browser has the `insertText` command at all. */
	supported = true;
	/** Commands refused because one was running; Chrome logs a warning for each. */
	refused = 0;
	/** Texts set as a whole. */
	assigned: string[] = [];
	history: Snapshot[] = [];
	oninput: (edit: EditInfo) => void = () => {};
	private running = false;

	constructor(value: string, start = value.length, end = start) {
		this.value = value;
		this.selectionStart = start;
		this.selectionEnd = end;
	}

	focus() {
		this.focused = true;
	}

	setSelectionRange(start: number, end: number) {
		this.selectionStart = start;
		this.selectionEnd = end;
	}

	private replaceSelection(text: string) {
		this.history.push({ value: this.value, start: this.selectionStart, end: this.selectionEnd });
		this.value =
			this.value.slice(0, this.selectionStart) + text + this.value.slice(this.selectionEnd);
		this.selectionStart = this.selectionEnd = this.selectionStart + text.length;
	}

	/** `document.execCommand('insertText', false, text)`. */
	insertText = (text: string): boolean => {
		if (!this.supported) return false;
		if (this.running) {
			this.refused++;
			return false;
		}
		this.running = true;
		try {
			this.replaceSelection(text);
			this.oninput({ inputType: 'insertText' });
		} finally {
			this.running = false;
		}
		return true;
	};

	setText = async (text: string): Promise<void> => {
		this.assigned.push(text);
		this.history = [];
		this.value = text;
		this.selectionStart = this.selectionEnd = text.length;
	};

	/** A key press: the same edit, made by the user and not by a command. */
	key(text: string, edit: EditInfo = { inputType: 'insertText' }) {
		this.replaceSelection(text);
		this.oninput(edit);
	}

	/** Ctrl+Z. */
	undo(): boolean {
		const last = this.history.pop();
		if (!last) return false;
		this.value = last.value;
		this.selectionStart = last.start;
		this.selectionEnd = last.end;
		this.oninput({ inputType: 'historyUndo' });
		return true;
	}
}

interface Options {
	readonly?: boolean;
	ebnf?: boolean;
}

/** A field wired to the editor the way GrammarEditor wires its textarea. */
function setup(text: string, start?: number, end?: number, opts: Options = {}) {
	const field = new FakeField(text, start, end);
	const reported: string[] = [];
	const pending: Promise<void>[] = [];
	const editing: GrammarInput = createGrammarInput({
		field: () => field,
		insertText: field.insertText,
		setText: field.setText,
		readonly: () => opts.readonly ?? false,
		ebnf: () => opts.ebnf ?? false,
		oninput: (value) => reported.push(value)
	});
	field.oninput = (edit) => {
		editing.note(edit);
		pending.push(editing.input(field.value));
	};
	/** Waits for the handlers of every `input` event so far. */
	const settled = async () => {
		while (pending.length) await pending.shift();
	};
	return { field, editing, reported, settled };
}

const caret = (field: FakeField) => [field.selectionStart, field.selectionEnd];

describe('createGrammarInput: palette', () => {
	it('inserts the symbol at the caret with its spaces and reports the text once', async () => {
		const { field, editing, reported } = setup('E → T');
		await editing.insert('|');
		expect(field.value).toBe('E → T | ');
		expect(caret(field)).toEqual([8, 8]);
		expect(field.focused).toBe(true);
		expect(reported).toEqual(['E → T | ']);
		expect(field.assigned).toEqual([]);
	});

	it('replaces the selection', async () => {
		const { field, editing, reported } = setup('E → T x T', 6, 7);
		await editing.insert('|');
		expect(field.value).toBe('E → T | T');
		expect(caret(field)).toEqual([7, 7]);
		expect(reported).toEqual(['E → T | T']);
	});

	// A grammar from a preset or a link written with ASCII arrows, then a palette
	// button before anything is typed.
	it('converts arrows that are already in the text after its own command has returned', async () => {
		const { field, editing, reported } = setup('E -> T | T + E\nT -> int');
		await editing.insert('|');
		expect(field.value).toBe('E → T | T + E\nT → int | ');
		expect(caret(field)).toEqual([24, 24]);
		// No command was given while the palette's own was running …
		expect(field.refused).toBe(0);
		// … so the text never had to be set as a whole, which would drop the undo history.
		expect(field.assigned).toEqual([]);
		expect(reported).toEqual(['E → T | T + E\nT → int | ']);
	});

	it('leaves every step of that insertion undoable', async () => {
		const { field, editing, settled } = setup('E -> T | T + E\nT -> int');
		await editing.insert('|');
		// The two conversions, then the insertion itself.
		expect(field.history).toHaveLength(3);
		field.undo();
		field.undo();
		await settled();
		// An undone conversion is not converted again.
		expect(field.value).toBe('E -> T | T + E\nT -> int | ');
		field.undo();
		await settled();
		expect(field.value).toBe('E -> T | T + E\nT -> int');
		expect(caret(field)).toEqual([23, 23]);
		expect(field.refused).toBe(0);
		expect(field.assigned).toEqual([]);
	});

	it('keeps the caret after the inserted symbol when arrows before it get shorter', async () => {
		const { field, editing } = setup('E -> T | T + E\nT -> int', 7, 8);
		await editing.insert('ε');
		expect(field.value).toBe('E → T ε T + E\nT → int');
		expect(caret(field)).toEqual([7, 7]);
		expect(field.refused).toBe(0);
	});

	it('sets the text as a whole, arrows converted, when the command is not available', async () => {
		const { field, editing, reported } = setup('E -> T', 6);
		field.supported = false;
		await editing.insert('|');
		expect(field.assigned).toEqual(['E → T | ']);
		expect(field.value).toBe('E → T | ');
		expect(caret(field)).toEqual([8, 8]);
		expect(reported).toEqual(['E → T | ']);
	});

	it('inserts { } [ ] with their spaces', async () => {
		const { field, editing } = setup('E → T', undefined, undefined, { ebnf: true });
		await editing.insert('{');
		expect(field.value).toBe('E → T { ');
	});

	it('does nothing in a read-only editor', async () => {
		const { field, editing, reported } = setup('E → T', undefined, undefined, { readonly: true });
		await editing.insert('|');
		expect(field.value).toBe('E → T');
		expect(field.focused).toBe(false);
		expect(reported).toEqual([]);
	});

	it('does nothing without a field', async () => {
		const reported: string[] = [];
		const editing = createGrammarInput({
			field: () => undefined,
			insertText: () => true,
			setText: async () => {},
			readonly: () => false,
			ebnf: () => false,
			oninput: (value) => reported.push(value)
		});
		await editing.insert('|');
		await editing.input('E -> T');
		// Without a field there is nothing to rewrite; the text is passed on.
		expect(reported).toEqual(['E -> T']);
	});
});

describe('createGrammarInput: typing', () => {
	it('turns a typed -> into → and keeps the caret after it', async () => {
		const { field, reported, settled } = setup('E ');
		field.key('-');
		field.key('>');
		await settled();
		expect(field.value).toBe('E →');
		expect(caret(field)).toEqual([3, 3]);
		expect(reported).toEqual(['E -', 'E →']);
		expect(field.refused).toBe(0);
		expect(field.assigned).toEqual([]);
	});

	it('converts in the middle of a line', async () => {
		const { field, settled } = setup('xy', 1);
		field.key('-');
		field.key('>');
		await settled();
		expect(field.value).toBe('x→y');
		expect(caret(field)).toEqual([2, 2]);
	});

	it('converts every arrow of pasted text, each one undoable', async () => {
		const { field, reported, settled } = setup('');
		field.key('E -> T\nT -> int', { inputType: 'insertFromPaste' });
		await settled();
		expect(field.value).toBe('E → T\nT → int');
		expect(caret(field)).toEqual([13, 13]);
		expect(reported).toEqual(['E → T\nT → int']);
		expect(field.history).toHaveLength(3);
	});

	it('does not rewrite an undo', async () => {
		const { field, reported, settled } = setup('E ');
		field.key('-');
		field.key('>');
		await settled();
		field.undo();
		await settled();
		expect(field.value).toBe('E ->');
		expect(reported.at(-1)).toBe('E ->');
	});

	it('converts again on the next edit after an undo', async () => {
		const { field, settled } = setup('E ');
		field.key('-');
		field.key('>');
		await settled();
		field.undo();
		await settled();
		// The undo leaves `->` selected; the next key goes after it.
		field.setSelectionRange(4, 4);
		field.key(' ');
		await settled();
		expect(field.value).toBe('E → ');
		expect(caret(field)).toEqual([4, 4]);
	});

	it('does not rewrite text an input method is composing', async () => {
		const { field, reported, settled } = setup('E ');
		field.key('->', { inputType: 'insertCompositionText', isComposing: true });
		await settled();
		expect(field.value).toBe('E ->');
		expect(reported).toEqual(['E ->']);
	});

	it('leaves quoted arrows and comments as typed', async () => {
		const { field, settled } = setup(`// a -> b\nE → '-`);
		field.key('>');
		field.key(`'`);
		await settled();
		expect(field.value).toBe(`// a -> b\nE → '->'`);
	});

	it('does not convert in a read-only editor', async () => {
		const { field, reported, settled } = setup('E -', undefined, undefined, { readonly: true });
		field.key('>');
		await settled();
		expect(field.value).toBe('E ->');
		expect(reported).toEqual(['E ->']);
	});

	it('sets the text as a whole when the command is not available', async () => {
		const { field, reported, settled } = setup('E -> T | T -', 12);
		field.supported = false;
		field.key('>');
		await settled();
		expect(field.assigned).toEqual(['E → T | T →']);
		expect(caret(field)).toEqual([11, 11]);
		expect(reported).toEqual(['E → T | T →']);
	});
});
