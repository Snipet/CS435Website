/**
 * Intermediate code, optimizer, code generator, and peephole optimizer,
 * checked against Intro (cont'd), compiler architecture, slide 4.
 */
import { describe, expect, it } from 'vitest';
import { compile } from './pipeline';
import { SLIDE_4_DECLS } from './presets';
import type { Decl } from './semantic';
import { formatQuad, optimizeTac, type Quad } from './tac';
import { formatInstr, generateCode, liveAfter, op, peephole, type Instr } from './vax';

function phases(source: string, decls: readonly Decl[] = SLIDE_4_DECLS) {
	const c = compile(source, decls);
	expect(c.stoppedAt).toBeNull();
	return {
		tac: c.tac!.map(formatQuad),
		optimized: c.optimized!.quads.map(formatQuad),
		code: c.code!.map(formatInstr),
		peephole: c.peephole!.code.map(formatInstr),
		c
	};
}

const withDecl = (name: string, change: Partial<Decl>) =>
	SLIDE_4_DECLS.map((d) => (d.name === name ? { ...d, ...change } : d));

describe('A= B1   +C; (slide 4)', () => {
	const p = phases('A= B1   +C;');

	it('intermediate code generator', () => {
		expect(p.tac).toEqual(['int2fp B1 _ t1', '+ t1 C t2', ':= t2 _ A']);
	});

	it('optimizer: C → #2.3 and t2 removed', () => {
		expect(p.optimized).toEqual(['int2fp B1 _ t1', '+ t1 #2.3 A']);
		expect(p.c.optimized!.changes.map((c) => c.kind)).toEqual(['propagate', 'copy']);
		expect(p.c.optimized!.quads[1].changed.sort()).toEqual(['arg2', 'result']);
	});

	it('code generator', () => {
		expect(p.code).toEqual(['CVTLF B1,r2', 'MOVF #2.3,r1', 'ADDF2 r1,r2', 'MOVF r2,A']);
	});

	it('peephole optimizer', () => {
		expect(p.peephole).toEqual(['CVTLF B1,r2', 'ADDF2 #2.3,r2', 'MOVF r2,A']);
		expect(p.c.peephole!.rewrites).toEqual([
			{
				rule: 'fold',
				before: ['MOVF #2.3,r1', 'ADDF2 r1,r2'],
				after: ['ADDF2 #2.3,r2'],
				reason: 'r1 is not used afterwards'
			}
		]);
		expect(p.c.peephole!.rewritten).toEqual([false, true, false]);
	});
});

describe('the slide’s assumptions switched off', () => {
	it('B1 float: int2fp disappears', () => {
		const p = phases('A= B1   +C;', withDecl('B1', { type: 'float' }));
		expect(p.tac).toEqual(['+ B1 C t1', ':= t1 _ A']);
		expect(p.optimized).toEqual(['+ B1 #2.3 A']);
		expect(p.code).toEqual(['MOVF B1,r2', 'MOVF #2.3,r1', 'ADDF2 r1,r2', 'MOVF r2,A']);
		expect(p.peephole).toEqual(['MOVF B1,r2', 'ADDF2 #2.3,r2', 'MOVF r2,A']);
	});

	it('C a variable: no propagation', () => {
		const p = phases('A= B1   +C;', withDecl('C', { value: '' }));
		expect(p.optimized).toEqual(['int2fp B1 _ t1', '+ t1 C A']);
		expect(p.peephole).toEqual(['CVTLF B1,r2', 'ADDF2 C,r2', 'MOVF r2,A']);
	});
});

describe('if x==y then z  =1; else z= 2  ;', () => {
	const decls: Decl[] = ['x', 'y', 'z'].map((name) => ({ name, type: 'int', value: '' }));
	const p = phases('if x==y then z  =1; else z= 2  ;', decls);

	it('jumps and labels', () => {
		expect(p.tac).toEqual([
			'== x y t1',
			'if_false t1 _ L1',
			':= #1 _ z',
			'goto _ _ L2',
			'label _ _ L1',
			':= #2 _ z',
			'label _ _ L2'
		]);
		expect(p.optimized).toEqual(p.tac);
	});

	it('compare and branch', () => {
		expect(p.code).toEqual([
			'MOVL x,r2',
			'MOVL y,r1',
			'CMPL r2,r1',
			'BNEQ L1',
			'MOVL #1,z',
			'BRB L2',
			'L1:',
			'MOVL #2,z',
			'L2:'
		]);
		expect(p.peephole).toEqual([
			'CMPL x,y',
			'BNEQ L1',
			'MOVL #1,z',
			'BRB L2',
			'L1:',
			'MOVL #2,z',
			'L2:'
		]);
	});
});

describe('other programs', () => {
	it('drops the jump to the next instruction when there is no else', () => {
		const p = phases('if n > 0 then n = n - 1;', [{ name: 'n', type: 'int', value: '' }]);
		expect(p.optimized).toEqual([
			'> n #0 t1',
			'if_false t1 _ L1',
			'- n #1 n',
			'goto _ _ L2',
			'label _ _ L1',
			'label _ _ L2'
		]);
		expect(p.peephole).toEqual([
			'CMPL n,#0',
			'BLEQ L1',
			'MOVL n,r2',
			'SUBL2 #1,r2',
			'MOVL r2,n',
			'L1:',
			'L2:'
		]);
		expect(p.c.peephole!.rewrites.map((r) => r.rule)).toContain('jump');
	});

	it('propagates and folds constants', () => {
		const p = phases('A = (C + 1) * B1;');
		expect(p.tac).toEqual([
			'int2fp #1 _ t1',
			'+ C t1 t2',
			'int2fp B1 _ t3',
			'* t2 t3 t4',
			':= t4 _ A'
		]);
		expect(p.optimized).toEqual(['int2fp B1 _ t3', '* #3.3 t3 A']);
		expect(p.c.optimized!.changes.map((c) => c.kind)).toEqual([
			'fold',
			'propagate',
			'fold',
			'copy'
		]);
		expect(p.peephole).toEqual(['CVTLF B1,r2', 'MULF2 #3.3,r2', 'MOVF r2,A']);
	});

	it('does not rewrite Y * 0 (structure slides, slide 16)', () => {
		const p = phases('X = Y * 0;', [
			{ name: 'X', type: 'float', value: '' },
			{ name: 'Y', type: 'float', value: '' }
		]);
		expect(p.optimized).toEqual(['* Y #0.0 X']);
		expect(p.peephole).toEqual(['MOVF Y,r2', 'MULF2 #0.0,r2', 'MOVF r2,X']);
	});

	it('folds a whole constant expression', () => {
		const p = phases('B1 = (7 - 1) / 4 * 2;');
		expect(p.optimized).toEqual([':= #2 _ B1']);
		expect(p.peephole).toEqual(['MOVL #2,B1']);
	});

	it('does not fold a division by zero', () => {
		const p = phases('B1 = 1 / 0;');
		expect(p.optimized).toEqual(['/ #1 #0 B1']);
	});

	it('keeps operand order for - and / and swaps + and * onto a held register', () => {
		const decls: Decl[] = ['a', 'b', 'c'].map((name) => ({ name, type: 'int', value: '' }));
		expect(phases('a = b - (c - a);', decls).peephole).toEqual([
			'MOVL c,r2',
			'SUBL2 a,r2',
			'MOVL b,r3',
			'SUBL2 r2,r3',
			'MOVL r3,a'
		]);
		expect(phases('a = b + (c + a);', decls).peephole).toEqual([
			'MOVL c,r2',
			'ADDL2 a,r2',
			'ADDL2 b,r2',
			'MOVL r2,a'
		]);
	});

	it('compares floats with CMPF after converting the int side', () => {
		const p = phases('if B1 < C then A = C; else A = B1;');
		expect(p.optimized).toEqual([
			'int2fp B1 _ t1',
			'< t1 #2.3 t2',
			'if_false t2 _ L1',
			':= #2.3 _ A',
			'goto _ _ L2',
			'label _ _ L1',
			'int2fp B1 _ A',
			'label _ _ L2'
		]);
		expect(p.peephole).toEqual([
			'CVTLF B1,r2',
			'CMPF r2,#2.3',
			'BGEQ L1',
			'MOVF #2.3,A',
			'BRB L2',
			'L1:',
			'CVTLF B1,r2',
			'MOVF r2,A',
			'L2:'
		]);
	});

	it('numbers labels of nested ifs in order', () => {
		const decls: Decl[] = ['a', 'b', 'c', 'm'].map((name) => ({ name, type: 'int', value: '' }));
		const p = phases('if a < b then if b < c then m = c; else m = b;', decls);
		expect(p.tac.filter((q) => q.startsWith('label')).map((q) => q.split(' ')[3])).toEqual([
			'L3',
			'L4',
			'L1',
			'L2'
		]);
	});
});

describe('constants that do not fit', () => {
	const ints: Decl[] = [
		{ name: 'x', type: 'int', value: '' },
		{ name: 'F', type: 'float', value: '' },
		{ name: 'E', type: 'float', value: '1000000000000000000000' }
	];

	it('folds an int operation only when the result fits in 32 bits', () => {
		expect(phases('x = 2147483646 + 1;', ints).optimized).toEqual([':= #2147483647 _ x']);
		const p = phases('x = 2147483647 + 1;', ints);
		expect(p.optimized).toEqual(['+ #2147483647 #1 x']);
		expect(p.c.optimized!.changes[0]).toEqual({
			kind: 'keep',
			text: '#2147483647 + #1 is not folded: the result does not fit in an int (32 bits).'
		});
		expect(phases('x = 65536 * 65536;', ints).optimized).toEqual(['* #65536 #65536 x']);
		expect(phases('x = 0 - 2147483647 - 1;', ints).optimized).toEqual([':= #-2147483648 _ x']);
	});

	it('does not fold a division by zero', () => {
		const p = phases('x = 1 / 0;', ints);
		expect(p.optimized).toEqual(['/ #1 #0 x']);
		expect(p.c.optimized!.changes.map((c) => c.text)).toEqual([
			'#1 / #0 is not folded: division by zero.',
			't1 removed: / writes x directly instead of copying t1 to it.'
		]);
	});

	it('writes a large float constant without an exponent', () => {
		const p = phases('F = E;', ints);
		expect(p.optimized).toEqual([':= #1000000000000000000000.0 _ F']);
		expect(p.peephole).toEqual(['MOVF #1000000000000000000000.0,F']);
	});
});

describe('optimizeTac', () => {
	it('removes a copy only right after the quad that computes the temporary', () => {
		const quads: Quad[] = [
			{ op: '+', arg1: 'a', arg2: 'b', result: 't1', type: 'int' },
			{ op: ':=', arg1: '#1', arg2: null, result: 'c' },
			{ op: ':=', arg1: 't1', arg2: null, result: 'd' }
		];
		expect(optimizeTac(quads, new Map()).quads.map(formatQuad)).toEqual([
			'+ a b t1',
			':= #1 _ c',
			':= t1 _ d'
		]);
	});
});

describe('peephole rules', () => {
	const run = (code: Instr[]) => peephole(code).code.map(formatInstr);

	it('drops a move of a register to itself', () => {
		expect(run([op('MOVL', ['r2', 'r2']), op('MOVL', ['r2', 'a'])])).toEqual(['MOVL r2,a']);
	});

	it('does not fold a load whose register is used later', () => {
		const code = [op('MOVF', ['#2.3', 'r1']), op('ADDF2', ['r1', 'r2']), op('MULF2', ['r1', 'r2'])];
		expect(run(code)).toEqual(['MOVF #2.3,r1', 'ADDF2 r1,r2', 'MULF2 r1,r2']);
	});

	it('does not fold into an operand the instruction writes', () => {
		const code = [op('MOVF', ['a', 'r2']), op('ADDF2', ['b', 'r2']), op('MOVF', ['r2', 'c'])];
		expect(run(code)).toEqual(['MOVF a,r2', 'ADDF2 b,r2', 'MOVF r2,c']);
	});

	it('does not fold across types', () => {
		const code = [op('MOVL', ['#2', 'r1']), op('ADDF2', ['r1', 'r2']), op('MOVF', ['r2', 'c'])];
		expect(run(code)).toEqual(['MOVL #2,r1', 'ADDF2 r1,r2', 'MOVF r2,c']);
	});

	it('follows branches when deciding a register is dead', () => {
		const code: Instr[] = [
			op('MOVL', ['#1', 'r1']),
			op('ADDL2', ['r1', 'r2']),
			op('BEQL', ['L1']),
			op('MOVL', ['#0', 'r1']),
			{ kind: 'label', label: 'L1' },
			op('MOVL', ['r1', 'a'])
		];
		expect(liveAfter(code)[1].has('r1')).toBe(true);
		expect(run(code)).toEqual(code.map(formatInstr));
	});

	it('follows a branch back to an earlier label', () => {
		const code: Instr[] = [
			{ kind: 'label', label: 'L1' },
			op('MOVL', ['r1', 'a']),
			op('MOVL', ['#2', 'r1']),
			op('ADDL2', ['r1', 'r2']),
			op('BNEQ', ['L1']),
			op('MOVL', ['r2', 'b'])
		];
		const live = liveAfter(code);
		// r1 is read again after the branch back to L1.
		expect(live[3].has('r1')).toBe(true);
		expect(live[4].has('r1')).toBe(true);
		expect(live[5].size).toBe(0);
		expect(run(code)).toEqual(code.map(formatInstr));
	});

	it('rewrites long code in one pass over it', () => {
		const code: Instr[] = [op('MOVL', ['a', 'r2'])];
		for (let k = 0; k < 2000; k++) code.push(op('MOVL', ['b', 'r1']), op('ADDL2', ['r1', 'r2']));
		code.push(op('MOVL', ['r2', 'x']));
		const out = peephole(code);
		expect(out.code).toHaveLength(2002);
		expect(out.code.slice(0, 3).map(formatInstr)).toEqual([
			'MOVL a,r2',
			'ADDL2 b,r2',
			'ADDL2 b,r2'
		]);
		expect(out.rewritten.filter(Boolean)).toHaveLength(2000);
		expect(out.rewrites).toHaveLength(2000);
	});
});

describe('generateCode', () => {
	it('branches on a value that is not a comparison', () => {
		const code = generateCode([{ op: 'if_false', arg1: 'a', arg2: null, result: 'L1' }]);
		expect(code.map(formatInstr)).toEqual(['CMPL a,#0', 'BEQL L1']);
	});
});
