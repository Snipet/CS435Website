import { describe, expect, it } from 'vitest';
import { applyAliases } from './regex-aliases';

describe('applyAliases', () => {
	it('converts \\e, \\p and \\S and moves the caret back', () => {
		expect(applyAliases('a | \\e', 6)).toEqual({ text: 'a | ε', caret: 5, changed: true });
		expect(applyAliases('(\\p|\\e)*\\S', 11)).toEqual({ text: '(ɸ|ε)*Σ', caret: 7, changed: true });
	});

	it('keeps the caret in place when the alias is after it', () => {
		expect(applyAliases('ab\\e', 1)).toEqual({ text: 'abε', caret: 1, changed: true });
	});

	it('puts the caret after the symbol when it was inside the alias', () => {
		expect(applyAliases('a\\eb', 2).caret).toBe(2);
	});

	it('leaves quoted literals alone', () => {
		for (const text of ["'\\e'", '"\\e"', '‘\\e’', "'it\\'s \\e'"]) {
			expect(applyAliases(text, text.length)).toEqual({ text, caret: text.length, changed: false });
		}
		expect(applyAliases("'it\\'s' \\e", 10).text).toBe("'it\\'s' ε");
		expect(applyAliases('‘a’ | \\e', 8).text).toBe('‘a’ | ε');
	});

	it('leaves escaped backslashes and other escapes alone', () => {
		expect(applyAliases('\\\\e', 3).changed).toBe(false);
		expect(applyAliases('\\x \\', 4).changed).toBe(false);
	});

	it('supports custom or empty alias maps', () => {
		expect(applyAliases('\\e', 2, {}).changed).toBe(false);
		expect(applyAliases('\\eps', 4, { '\\eps': 'ε' }).text).toBe('ε');
	});

	it('does nothing for plain text', () => {
		expect(applyAliases('(0 | 1)*00', 3)).toEqual({ text: '(0 | 1)*00', caret: 3, changed: false });
	});
});
