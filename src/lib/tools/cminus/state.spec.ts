import { describe, expect, it } from 'vitest';
import { toolLink, type LinkStates } from '$lib/tools/links';
import { toolBySlug } from '$lib/tools/registry';
import { isTinyVmHash } from '$lib/tools/tiny-vm/state';
import { decode, encode } from '$lib/url-state';
import { compile } from '$lib/theory/cminus';
import { DEFAULT_PRESET } from './presets';
import {
	TABS,
	clampSelection,
	defaultState,
	isCminusHash,
	lineBreaks,
	stateFromHash,
	type CminusState
} from './state';

describe('default state', () => {
	it('is the default preset, optimized, with letters-only identifiers and the first tab', () => {
		expect(defaultState()).toEqual({
			source: DEFAULT_PRESET.value.source,
			input: '48 18',
			optimize: true,
			identifiers: 'letters',
			tab: 'tokens',
			ir: 'before',
			code: 'before',
			comments: false,
			sel: null
		});
		expect(TABS).toEqual(['tokens', 'syntax', 'semantics', 'ir', 'code', 'run', 'language']);
	});
});

describe('hash state', () => {
	const saved: CminusState = {
		source: 'void main(void) { output(input() + 1); }',
		input: '4\n5',
		optimize: false,
		identifiers: 'extended',
		tab: 'code',
		ir: 'after',
		code: 'after',
		comments: true,
		sel: [18, 37]
	};

	it('round-trips the page state', () => {
		const back = decode(encode(saved), isCminusHash);
		expect(back).not.toBeNull();
		expect(stateFromHash(back!)).toEqual(saved);
	});

	it('accepts the shape other tools link with', () => {
		const link: LinkStates['cminus'] = { source: 'void main(void) { }' };
		expect(isCminusHash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			...defaultState(),
			source: 'void main(void) { }',
			input: ''
		});
		const withInput: LinkStates['cminus'] = { source: 'void main(void) { }', input: '1 2' };
		expect(isCminusHash(withInput)).toBe(true);
		expect(stateFromHash(withInput).input).toBe('1 2');
		// Extra fields are ignored.
		expect(isCminusHash({ source: '', extra: 1 })).toBe(true);
	});

	it('is what toolLink builds, when the tool is registered', () => {
		expect(toolBySlug('cminus')?.title).toBe('C- Compiler');
		const href = toolLink('cminus', { source: 'int x;', input: '7' });
		expect(href).not.toBeNull();
		const value = decode(href!.slice(href!.indexOf('#')), isCminusHash);
		expect(value).toEqual({ source: 'int x;', input: '7' });
	});

	it('rejects values of another shape', () => {
		const wrong: unknown[] = [
			null,
			3,
			'x',
			[],
			{},
			{ input: '1' },
			{ source: 3 },
			{ source: '', input: 1 },
			{ source: '', optimize: 'yes' },
			{ source: '', identifiers: 'digits' },
			{ source: '', tab: 'assembly' },
			{ source: '', ir: 'both' },
			{ source: '', code: 0 },
			{ source: '', comments: 'no' },
			{ source: '', sel: [1] },
			{ source: '', sel: [2, 1] },
			{ source: '', sel: [-1, 2] },
			{ source: '', sel: [0.5, 2] },
			{ source: '', sel: 'all' }
		];
		for (const v of wrong) expect(isCminusHash(v), JSON.stringify(v)).toBe(false);
		expect(isCminusHash({ source: '', sel: null })).toBe(true);
	});

	it('writes line breaks as the editor does, and drops a selection counted in other text', () => {
		expect(lineBreaks('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
		const loaded = stateFromHash({
			source: 'void main(void)\r\n{\r\n}\r\n',
			input: '1\r\n2',
			sel: [0, 4]
		});
		expect(loaded.source).toBe('void main(void)\n{\n}\n');
		expect(loaded.input).toBe('1\n2');
		expect(loaded.sel).toBeNull();
		expect(stateFromHash({ source: 'void main(void)\n{\n}\n', sel: [0, 4] }).sel).toEqual([0, 4]);
	});

	it('keeps a selection inside the text and drops an empty one', () => {
		expect(clampSelection([2, 5], 10)).toEqual([2, 5]);
		expect(clampSelection([2, 50], 10)).toEqual([2, 10]);
		expect(clampSelection([20, 50], 10)).toBeNull();
		expect(clampSelection([3, 3], 10)).toBeNull();
		expect(clampSelection(null, 10)).toBeNull();
		expect(clampSelection(undefined, 10)).toBeNull();
		expect(stateFromHash({ source: 'int x;', sel: [4, 99] }).sel).toEqual([4, 6]);
		expect(stateFromHash({ source: 'int x;', sel: [9, 99] }).sel).toBeNull();
	});
});

describe('the link to the TINY Machine', () => {
	it('carries a listing and input that the TINY Machine page accepts', () => {
		const c = compile(DEFAULT_PRESET.value.source);
		const state: LinkStates['tiny-vm'] = {
			program: c.codegen!.peephole.code.listing,
			input: DEFAULT_PRESET.value.input
		};
		expect(isTinyVmHash(state)).toBe(true);
		const href = toolLink('tiny-vm', state);
		expect(href).not.toBeNull();
		expect(decode(href!.slice(href!.indexOf('#')), isTinyVmHash)).toEqual(state);
	});
});
