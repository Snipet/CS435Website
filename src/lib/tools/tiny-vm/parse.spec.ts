import { describe, expect, it } from 'vitest';
import { formatInstruction } from './machine';
import { highlightTM, parseTM, parseTMCached, programKey } from './parse';

const listing = (text: string) =>
	parseTM(text).program.entries.map((e) => `${e.addr}: ${formatInstruction(e.instr)}`);

const errors = (text: string) => parseTM(text).diagnostics.filter((d) => d.severity === 'error');

describe('parseTM', () => {
	it('reads RR and RM/RA forms as tm.c writes them', () => {
		expect(listing('0: IN 0,0,0\n1: LD 2,-4(6)\n2: JNE 0,-3(7)')).toEqual([
			'0: IN 0,0,0',
			'1: LD 2,-4(6)',
			'2: JNE 0,-3(7)'
		]);
	});

	it('reads the slide style: three numbers for RA as r, d, s, and a bare HALT', () => {
		const { program, diagnostics } = parseTM('2:  LDC   1, 1, 0\n8:  HALT');
		expect(diagnostics).toEqual([]);
		expect(program.get(2)).toEqual({ op: 'LDC', a1: 1, a2: 1, a3: 0 });
		expect(program.get(8)).toEqual({ op: 'HALT', a1: 0, a2: 0, a3: 0 });
	});

	it('skips blank lines and * comments, and keeps text after the operands as a comment', () => {
		const { program, diagnostics } = parseTM(
			'* whole-line comment\n\n  1:  LDA  6,0(0) \tclear location 0\r\n0: HALT end'
		);
		expect(diagnostics).toEqual([]);
		expect(program.entries.map((e) => [e.addr, e.line, e.comment])).toEqual([
			[0, 4, 'end'],
			[1, 3, 'clear location 0']
		]);
	});

	it('accepts lower-case opcodes and spaces around punctuation', () => {
		expect(listing('3 : ldc 1 , 5 ( 0 )')).toEqual(['3: LDC 1,5(0)']);
	});

	it('gives each instruction a span from the address through the operands', () => {
		const text = '* c\n1:  JLE   0, 6(7)   jump';
		const e = parseTM(text).program.entries[0];
		expect(text.slice(e.span.start, e.span.end)).toBe('1:  JLE   0, 6(7)');
	});

	it('reports problems as located errors', () => {
		const cases: [string, RegExp, string][] = [
			['IN 0,0,0', /Expected an address/, 'IN'],
			['0 IN 0,0,0', /Expected ":"/, 'IN'],
			['0: JMP 1', /Unknown opcode "JMP"/, 'JMP'],
			['0: ADD 1,2', /Expected ","/, ''],
			['0: ADD 1,2,8', /Register t is 8; registers are 0–7/, '8'],
			['0: LD 9,0(0)', /Register r is 9/, '9'],
			['0: LD 1,x(0)', /Expected the offset d/, 'x'],
			['0: LD 1,0(0', /Expected "\)"/, ''],
			['0: LD 1,0 0', /Expected "\(" after the offset/, '0'],
			['0: IN', /Expected register r/, ''],
			['1024: HALT', /Address 1024 is outside iMem \(0 … 1023\)/, '1024'],
			['0: LDC 1,99999999999(0)', /does not fit in a 32-bit int/, '99999999999'],
			['0:', /Expected an opcode/, '']
		];
		for (const [text, message, spanned] of cases) {
			const errs = errors(text);
			expect(errs, text).toHaveLength(1);
			expect(errs[0].message, text).toMatch(message);
			const span = errs[0].span!;
			expect(text.slice(span.start, span.end), text).toBe(spanned);
		}
	});

	it('locates errors on later lines by offset into the whole text', () => {
		const text = '0: HALT\n1: FOO 1,2,3';
		const [err] = errors(text);
		expect(text.slice(err.span!.start, err.span!.end)).toBe('FOO');
	});

	it('warns when an address is loaded twice; the later line wins', () => {
		const { program, diagnostics } = parseTM('0: LDC 1,1(0)\n0: LDC 1,2(0)');
		expect(program.get(0)?.a2).toBe(2);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].severity).toBe('warning');
		expect(diagnostics[0].message).toMatch(/also loaded on line 1/);
	});

	it('warns when text after the operands looks like another operand', () => {
		const { diagnostics } = parseTM('0: ADD 1,2,3,4');
		expect(diagnostics.map((d) => d.severity)).toEqual(['warning']);
		expect(diagnostics[0].message).toMatch(/",4" after the operands is read as a comment/);
	});

	it('keeps parsing after a bad line', () => {
		const { program, diagnostics } = parseTM('0: FOO\n1: HALT');
		expect(diagnostics).toHaveLength(1);
		expect(program.entries.map((e) => e.addr)).toEqual([1]);
	});

	it('notes an empty program', () => {
		const { program, diagnostics } = parseTM('* nothing\n');
		expect(program.entries).toEqual([]);
		expect(diagnostics).toEqual([
			{ severity: 'info', message: 'No instructions: every iMem cell holds HALT 0,0,0.' }
		]);
	});

	it('identifies programs by their instructions', () => {
		expect(programKey(parseTM('0: LDC 1, 1, 0 * one').program)).toBe(
			programKey(parseTM('* x\n0:LDC 1,1(0)').program)
		);
		expect(programKey(parseTM('0: LDC 1,1(0)').program)).not.toBe(
			programKey(parseTM('0: LDC 1,2(0)').program)
		);
	});
});

describe('highlightTM', () => {
	it('colors addresses, opcodes, numbers, punctuation and comments', () => {
		const text = '* c\n1:  JLE 0,6(7) go';
		const got = highlightTM(text).map((t) => [text.slice(t.from, t.to), t.className]);
		expect(got).toEqual([
			['* c', 'hl-comment'],
			['1', 'hl-name'],
			[':', 'hl-punct'],
			['JLE', 'hl-keyword'],
			['0', 'hl-number'],
			[',', 'hl-punct'],
			['6', 'hl-number'],
			['(', 'hl-punct'],
			['7', 'hl-number'],
			[')', 'hl-punct'],
			['go', 'hl-comment']
		]);
	});

	it('reuses the last parse', () => {
		expect(parseTMCached('0: HALT')).toBe(parseTMCached('0: HALT'));
	});
});
