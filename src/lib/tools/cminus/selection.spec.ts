import { describe, expect, it } from 'vitest';
import { allNodes, codeQuads, compile, type AstNode, type Compilation } from '$lib/theory/cminus';
import { PRESETS, presetById } from './presets';
import {
	NO_MARKS,
	ancestorsOf,
	describeSelection,
	enclosingNode,
	excerpt,
	lineAt,
	marksFor,
	nodeById,
	pieceAt,
	plural,
	rangeOf,
	rangeOfCaret,
	rangeOfDeclaration,
	rangeOfDiagnostic,
	rangeOfUse,
	sameRange,
	trimRange,
	within,
	type SourceRange
} from './selection';

const GCD = presetById('gcd')!.value.source;
const SORT = presetById('sort')!.value.source;

/** The range of the first (or n-th) occurrence of `text` in the source, after its opening comment. */
function find(source: string, text: string, nth = 0): SourceRange {
	let at = source.startsWith('/*') ? source.indexOf('*/') + 1 : -1;
	for (let i = 0; i <= nth; i++) {
		at = source.indexOf(text, at + 1);
		if (at === -1) throw new Error(`"${text}" (${nth}) is not in the source`);
	}
	return { start: at, end: at + text.length };
}

const textOf = (c: Compilation, range: SourceRange | null) =>
	range ? c.source.slice(range.start, range.end) : null;

const sorted = (set: ReadonlySet<number>) => [...set].sort((a, b) => a - b);

/** Ids of the nodes of the subtree under `node`. */
const subtree = (node: AstNode) => new Set(allNodes(node).map((n) => n.id));

describe('ranges', () => {
	it('within: a span that is not empty and lies in the range', () => {
		const range = { start: 4, end: 10 };
		expect(within({ start: 4, end: 10 }, range)).toBe(true);
		expect(within({ start: 5, end: 6 }, range)).toBe(true);
		expect(within({ start: 3, end: 6 }, range)).toBe(false);
		expect(within({ start: 9, end: 11 }, range)).toBe(false);
		expect(within({ start: 6, end: 6 }, range)).toBe(false);
		expect(within(null, range)).toBe(false);
		expect(within(undefined, range)).toBe(false);
	});

	it('rangeOf, sameRange, trimRange', () => {
		const span = { start: 2, end: 5, line: 1, column: 3, source: null };
		expect(rangeOf(span)).toEqual({ start: 2, end: 5 });
		expect(sameRange({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true);
		expect(sameRange({ start: 1, end: 2 }, { start: 1, end: 3 })).toBe(false);
		expect(sameRange(null, null)).toBe(true);
		expect(sameRange(null, { start: 1, end: 2 })).toBe(false);

		expect(trimRange('  a = 1;\n', { start: 0, end: 9 })).toEqual({ start: 2, end: 8 });
		expect(trimRange('  a = 1;\n', { start: 0, end: 2 })).toBeNull();
		expect(trimRange('abc', { start: 1, end: 99 })).toEqual({ start: 1, end: 3 });
	});

	it('lineAt, excerpt, plural', () => {
		expect(lineAt('a\nb\nc', 0)).toBe(1);
		expect(lineAt('a\nb\nc', 2)).toBe(2);
		expect(lineAt('a\nb\nc', 4)).toBe(3);
		expect(excerpt('if (v == 0)\n    return u;', { start: 0, end: 25 })).toBe(
			'if (v == 0) return u;'
		);
		expect(excerpt('x'.repeat(100), { start: 0, end: 100 }, 10)).toBe(`${'x'.repeat(9)}…`);
		expect(plural(1, 'token')).toBe('1 token');
		expect(plural(0, 'token')).toBe('0 tokens');
		expect(plural(1234, 'quad')).toBe('1,234 quads');
		expect(plural(2, 'entry', 'entries')).toBe('2 entries');
	});

	it('lineAt counts the line breaks before an offset, for any text and offset', () => {
		/** The definition, one character at a time. */
		const counted = (text: string, offset: number) => {
			let line = 1;
			for (let i = 0; i < Math.min(offset, text.length); i++) if (text[i] === '\n') line++;
			return line;
		};
		const texts = ['', 'a', '\n', '\n\n', 'a\n', '\na', 'ab\n\ncd\n', GCD, SORT, 'x;\n'.repeat(40)];
		for (const text of texts) {
			for (let offset = 0; offset <= text.length + 2; offset++) {
				expect(lineAt(text, offset), `${JSON.stringify(text.slice(0, 12))} at ${offset}`).toBe(
					counted(text, offset)
				);
			}
		}
		// Asked about one text, then another, then the first again.
		expect(lineAt('a\nb', 2)).toBe(2);
		expect(lineAt('a b', 2)).toBe(1);
		expect(lineAt('a\nb', 2)).toBe(2);
		expect(lineAt('a\nb', -1)).toBe(1);
	});
});

describe('marksFor', () => {
	const c = compile(GCD);
	const statement = find(GCD, 'return gcd(v, u - u / v * v);');

	it('marks nothing without a selection, a compilation or a range', () => {
		expect(marksFor(c, null)).toBe(NO_MARKS);
		expect(marksFor(null, statement)).toBe(NO_MARKS);
		expect(marksFor(c, { start: 5, end: 5 })).toBe(NO_MARKS);
	});

	it('follows a statement through every phase', () => {
		const marks = marksFor(c, statement);
		// return gcd ( v , u - u / v * v ) ;
		expect(sorted(marks.tokens).map((i) => c.scan.tokens[i].lexeme)).toEqual(
			'return gcd ( v , u - u / v * v ) ;'.split(' ')
		);
		const labels = sorted(marks.nodes).map((id) => nodeById(c.parse!.program, id)!.kind);
		expect(labels).toEqual([
			'Return',
			'Call',
			'Var',
			'Binary',
			'Var',
			'Binary',
			'Binary',
			'Var',
			'Var',
			'Var'
		]);
		expect(sorted(marks.quads).map((i) => c.ir!.quads[i].op)).toEqual([
			'/',
			'*',
			'-',
			'param',
			'param',
			'call',
			'return'
		]);
		// The optimizer leaves this statement alone.
		expect(sorted(marks.optimized).map((i) => c.optimized!.program.quads[i].id)).toEqual(
			sorted(marks.quads)
		);
		expect(marks.code.size).toBeGreaterThan(marks.final.size);
		expect(marks.final.size).toBeGreaterThan(0);
	});

	it('gives the quads of a head that lies in the range: the test and the jump of an if', () => {
		const head = find(GCD, 'if (v == 0)');
		const marks = marksFor(c, head);
		expect(sorted(marks.nodes).map((id) => nodeById(c.parse!.program, id)!.kind)).toEqual([
			'Binary',
			'Var',
			'Num'
		]);
		// The If node itself is larger than the head; its jump and labels carry the head's span.
		expect(sorted(marks.quads).map((i) => c.ir!.quads[i].op)).toEqual([
			'==',
			'if_false',
			'goto',
			'label',
			'label'
		]);
		expect(sorted(marks.optimized).map((i) => c.optimized!.program.quads[i].op)).toEqual([
			'==',
			'if_false',
			'label'
		]);
	});

	it('gives begin for a function header and end for its closing brace', () => {
		const header = marksFor(c, find(GCD, 'int gcd(int u, int v)'));
		expect(sorted(header.quads).map((i) => c.ir!.quads[i].op)).toEqual(['begin']);
		expect(sorted(header.nodes).map((id) => nodeById(c.parse!.program, id)!.kind)).toEqual([
			'Param',
			'Param'
		]);
		const close = c.parse!.program.decls[1];
		if (close.kind !== 'FunDecl') throw new Error('main is a function');
		const brace = marksFor(c, rangeOf(close.body.closeSpan));
		expect(sorted(brace.quads).map((i) => c.ir!.quads[i].op)).toEqual(['end']);
		expect(brace.tokens.size).toBe(1);
		expect(brace.nodes.size).toBe(0);
		expect(brace.final.size).toBe(1);
	});

	it('marks a token alone, and the comments in the range', () => {
		const semi = marksFor(c, find(GCD, ';'));
		expect(semi.tokens.size).toBe(1);
		expect(semi.nodes.size).toBe(0);
		expect(semi.quads.size).toBe(0);
		expect(semi.final.size).toBe(0);
		const all = marksFor(c, { start: 0, end: GCD.length });
		expect(all.comments.size).toBe(1);
		expect(all.tokens.size).toBe(c.scan.tokens.length - 1); // ENDFILE is empty
		expect(all.nodes.size).toBe(allNodes(c.parse!.program).length);
		expect(all.quads.size).toBe(c.ir!.quads.length);
		expect(all.optimized.size).toBe(c.optimized!.program.quads.length);
		// The prelude, input and output come from no quad.
		expect(all.final.size).toBe(
			c.codegen!.peephole.code.instructions.filter((i) => i.quad !== null).length
		);
		expect(all.code.size).toBeLessThan(c.codegen!.code.instructions.length);
	});

	it('uses the quads as generated when the optimizer is off', () => {
		const plain = compile(GCD, { optimize: false });
		const marks = marksFor(plain, find(GCD, 'if (v == 0)'));
		expect(marks.optimized.size).toBe(0);
		expect(sorted(marks.quads).map((i) => plain.ir!.quads[i].op)).toContain('goto');
		const quads = plain.ir!.quads;
		for (const addr of marks.final) {
			const instruction = plain.codegen!.peephole.code.instructions[addr];
			expect(marks.quads.has(instruction.quad!)).toBe(true);
			expect(quads[instruction.quad!].span).toEqual(instruction.span);
		}
	});

	it('marks only the phases that were reached', () => {
		const lexical = compile(presetById('illegal-character')!.value.source);
		const m1 = marksFor(lexical, { start: 0, end: lexical.source.length });
		expect(m1.tokens.size).toBeGreaterThan(0);
		expect(m1.nodes.size).toBe(0);
		expect(m1.quads.size).toBe(0);

		const undeclared = compile(presetById('undeclared')!.value.source);
		const m2 = marksFor(undeclared, { start: 0, end: undeclared.source.length });
		expect(m2.nodes.size).toBe(allNodes(undeclared.parse!.program).length);
		expect(m2.quads.size).toBe(0);
		expect(m2.final.size).toBe(0);
	});
});

describe('marksFor, on every node of every preset', () => {
	const cases = PRESETS.flatMap((p) => [
		{ id: p.id, optimize: true },
		{ id: p.id, optimize: false }
	]);

	it.each(cases)('$id (optimize: $optimize)', ({ id, optimize }) => {
		const c = compile(presetById(id)!.value.source, { optimize });
		if (!c.parse) {
			expect(marksFor(c, { start: 0, end: c.source.length }).nodes.size).toBe(0);
			return;
		}
		const final = codeQuads(c);
		for (const node of allNodes(c.parse.program)) {
			const marks = marksFor(c, rangeOf(node.span));
			const below = subtree(node);
			// The nodes inside a node's text are the nodes of its subtree (and a node above it with the same text).
			for (const id of below) expect(marks.nodes.has(id)).toBe(true);
			for (const id of marks.nodes) {
				if (!below.has(id))
					expect(rangeOf(nodeById(c.parse.program, id)!.span)).toEqual(rangeOf(node.span));
			}
			for (const i of marks.tokens) expect(within(c.scan.tokens[i].span, node.span)).toBe(true);
			if (!c.ir) continue;
			// The quads marked are those generated from the subtree's nodes. The one
			// more a function's body has is the `end` of its closing brace, which is
			// in its text and belongs to the function's node.
			for (const [set, quads] of [
				[marks.quads, c.ir.quads],
				[marks.optimized, c.optimized?.program.quads ?? []]
			] as const) {
				const fromNodes = quads.flatMap((q, i) =>
					q.node !== null && below.has(q.node) ? [i] : []
				);
				const extra = sorted(set).filter((i) => !fromNodes.includes(i));
				expect(sorted(set).filter((i) => fromNodes.includes(i))).toEqual(fromNodes);
				for (const i of set) expect(within(quads[i].span, node.span)).toBe(true);
				if (node.kind === 'Compound' && extra.length) {
					expect(extra.map((i) => quads[i].op)).toEqual(['end']);
				} else {
					expect(extra.filter((i) => !marks.nodes.has(quads[i].node!))).toEqual([]);
				}
			}
			if (!c.codegen || !final) continue;
			const picked = c.optimized ? marks.optimized : marks.quads;
			// The instructions marked are exactly those generated from the marked quads.
			for (const [set, code] of [
				[marks.code, c.codegen.code],
				[marks.final, c.codegen.peephole.code]
			] as const) {
				const expected = code.instructions
					.filter((ins) => ins.quad !== null && picked.has(ins.quad))
					.map((ins) => ins.addr);
				expect(sorted(set)).toEqual(expected);
				for (const addr of set) {
					expect(within(code.instructions[addr].span, node.span)).toBe(true);
				}
			}
			// What the peephole pass keeps of the marked code is the marked final code.
			const origins = new Set(
				sorted(marks.final).map((a) => c.codegen!.peephole.code.instructions[a].origin)
			);
			for (const origin of origins) expect(marks.code.has(origin)).toBe(true);
		}
	});
});

describe('the tree index', () => {
	const c = compile(GCD);
	const program = c.parse!.program;

	it('finds a node by id and the nodes above it', () => {
		for (const node of allNodes(program)) expect(nodeById(program, node.id)).toBe(node);
		expect(nodeById(program, 9999)).toBeUndefined();
		expect(ancestorsOf(program, 0)).toEqual([]);
		expect(ancestorsOf(program, 9999)).toEqual([]);
		const u = enclosingNode(program, {
			start: find(GCD, 'u / v').start,
			end: find(GCD, 'u / v').start + 1
		})!;
		expect(u.kind).toBe('Var');
		expect(ancestorsOf(program, u.id).map((id) => nodeById(program, id)!.kind)).toEqual([
			'Program',
			'FunDecl',
			'Compound',
			'Return',
			'Call',
			'Binary',
			'Binary',
			'Binary'
		]);
	});

	it('enclosingNode: the innermost node around a range', () => {
		const division = enclosingNode(program, find(GCD, 'u / v'))!;
		expect(division.kind).toBe('Binary');
		expect(textOf(c, division.span)).toBe('u / v');
		// An operator alone belongs to its expression.
		expect(textOf(c, enclosingNode(program, find(GCD, '*'))!.span)).toBe('u / v * v');
		// A range over two functions is only inside the program.
		expect(enclosingNode(program, { start: 0, end: GCD.length })).toBeNull();
		expect(
			enclosingNode(program, {
				start: program.decls[0].span.end - 1,
				end: program.decls[1].span.start + 1
			})?.kind
		).toBe('Program');
	});
});

describe('from a click to a range', () => {
	const c = compile(SORT);
	const semantic = c.semantic!;
	const symbol = (name: string, depth?: number) =>
		semantic.symbols.find((s) => s.name === name && (depth === undefined || s.depth === depth))!;

	it('a use selects the variable, the element or the call it is part of', () => {
		const a = symbol('a');
		expect(textOf(c, rangeOfUse(c, a.uses[0]))).toBe('a[i]');
		const sort = symbol('sort');
		expect(textOf(c, rangeOfUse(c, sort.uses[0]))).toBe('sort(numbers, 10)');
		const last = symbol('last');
		expect(textOf(c, rangeOfUse(c, last.uses[0]))).toBe('last');
		// Without a tree the name itself is the range.
		const broken = compile('int x; %');
		expect(rangeOfUse(broken, { start: 4, end: 5 })).toEqual({ start: 4, end: 5 });
	});

	it('a declaration selects the declaration, the parameter or the function header', () => {
		expect(textOf(c, rangeOfDeclaration(c, symbol('numbers')))).toBe('int numbers[10];');
		expect(textOf(c, rangeOfDeclaration(c, symbol('held')))).toBe('int held;');
		expect(textOf(c, rangeOfDeclaration(c, symbol('a')))).toBe('int a[]');
		expect(textOf(c, rangeOfDeclaration(c, symbol('sort')))).toBe('void sort(int a[], int count)');
		expect(rangeOfDeclaration(c, symbol('input'))).toBeNull();
		expect(rangeOfDeclaration(c, symbol('output'))).toBeNull();
	});

	it('a diagnostic selects the text it is about', () => {
		const undeclared = compile(presetById('undeclared')!.value.source);
		expect(
			undeclared.diagnostics.map((d) => textOf(undeclared, rangeOfDiagnostic(undeclared, d.span)))
		).toEqual(['y', 'z']);
		const illegal = compile('void main(void) { output(7 % 2); }');
		expect(illegal.stoppedAt).toBe('scanner');
		expect(textOf(illegal, rangeOfDiagnostic(illegal, illegal.diagnostics[0].span))).toBe('%');
	});

	it('a diagnostic about the end of the program selects the last token before it', () => {
		// The parser reports what is missing at the end with an empty span: there is no character there.
		const cases: [source: string, selected: string][] = [
			['void main(void) {', '{'],
			['void main(void) { output(1)', ')'],
			['void main(void) { output(1) \n\n  ', ')'],
			['int x', 'x'],
			['void main(void) { output(1); /* the end */', ';']
		];
		for (const [source, selected] of cases) {
			const broken = compile(source);
			expect(broken.stoppedAt, source).toBe('parser');
			expect(broken.diagnostics.length, source).toBeGreaterThan(0);
			for (const d of broken.diagnostics) {
				expect(d.span.end, source).toBe(d.span.start);
				const range = rangeOfDiagnostic(broken, d.span);
				expect(textOf(broken, range), source).toBe(selected);
				// The page selects it: the range is not empty and has a token to mark.
				expect(marksFor(broken, range).tokens.size, source).toBe(1);
			}
		}
	});

	it('an empty place selects the token after it when none comes before, and nothing without tokens', () => {
		const c = compile('  int x;');
		expect(textOf(c, rangeOfDiagnostic(c, { start: 0, end: 0 }))).toBe('int');
		expect(textOf(c, rangeOfDiagnostic(c, { start: 5, end: 5 }))).toBe('int');
		expect(textOf(c, rangeOfDiagnostic(c, { start: 6, end: 6 }))).toBe('int');
		expect(textOf(c, rangeOfDiagnostic(c, { start: 7, end: 7 }))).toBe('x');
		expect(textOf(c, rangeOfDiagnostic(c, { start: 8, end: 8 }))).toBe(';');
		for (const source of ['', '   \n', '/* nothing but a comment */']) {
			const empty = compile(source);
			expect(empty.diagnostics, source).toHaveLength(1);
			expect(rangeOfDiagnostic(empty, empty.diagnostics[0].span), source).toBeNull();
		}
	});
});

describe('the caret', () => {
	const c = compile(GCD);
	const program = c.parse!.program;
	const at = (text: string, offset = 0, nth = 0) => find(GCD, text, nth).start + offset;
	const piece = (offset: number) => textOf(c, pieceAt(program, offset));

	it('stands in the statement or declaration around it', () => {
		expect(piece(at('a = input();', 0))).toBe('a = input();');
		expect(piece(at('a = input();', 6))).toBe('a = input();');
		// At the end of the line, after the semicolon.
		expect(piece(at('a = input();', 12))).toBe('a = input();');
		expect(piece(at('int a;', 2))).toBe('int a;');
		expect(piece(at('return u;', 7))).toBe('return u;');
		expect(piece(at('u - u / v * v', 6))).toBe('return gcd(v, u - u / v * v);');
	});

	it('stands in the head of an if or while, in a function header, or on a closing brace', () => {
		expect(piece(at('if (v == 0)', 1))).toBe('if (v == 0)');
		expect(piece(at('if (v == 0)', 5))).toBe('if (v == 0)');
		expect(piece(at('int gcd(int u, int v)', 2))).toBe('int gcd(int u, int v)');
		expect(piece(at('int gcd(int u, int v)', 13))).toBe('int gcd(int u, int v)');
		expect(piece(at('void main(void)', 7))).toBe('void main(void)');
		// The closing brace of gcd, before it and after it.
		expect(piece(at('}', 0))).toBe('}');
		expect(piece(at('}', 1))).toBe('}');

		const loop = compile(presetById('factorial-loop')!.value.source);
		const head = find(loop.source, 'while (n > 1)');
		expect(textOf(loop, pieceAt(loop.parse!.program, head.start + 8))).toBe('while (n > 1)');
		// The closing brace of the loop's block is not a piece.
		const inner = find(loop.source, '  }');
		expect(pieceAt(loop.parse!.program, inner.start + 2)).toBeNull();

		const withElse = compile('void main(void) { if (1) output(1); else output(2); }');
		const elseAt = withElse.source.indexOf('else') + 2;
		expect(textOf(withElse, pieceAt(withElse.parse!.program, elseAt))).toBe('else');
	});

	it('stands in nothing in a comment, on a blank line or on an opening brace', () => {
		expect(pieceAt(program, 5)).toBeNull();
		expect(pieceAt(program, at('\n\nvoid main', 1))).toBeNull();
		expect(pieceAt(program, at('{', 0))).toBeNull();
	});

	it('rangeOfCaret: the piece, else the token, else nothing; selected text is taken as it is', () => {
		const pieceRange = rangeOfCaret(c, at('b = input();', 2), at('b = input();', 2));
		expect(textOf(c, pieceRange)).toBe('b = input();');
		// An opening brace is no piece: the token.
		expect(textOf(c, rangeOfCaret(c, at('{'), at('{')))).toBe('{');
		expect(rangeOfCaret(c, 5, 5)).toBeNull();
		// Selected text, without the white space at its ends.
		const line = find(GCD, '  if (v == 0)\n');
		expect(textOf(c, rangeOfCaret(c, line.start, line.end))).toBe('if (v == 0)');
		expect(rangeOfCaret(c, line.start, line.start + 2)).toBeNull();

		// Without a tree, the token at the caret; the one that starts there wins.
		const broken = compile('int x%y;');
		expect(broken.parse).toBeNull();
		expect(textOf(broken, rangeOfCaret(broken, 4, 4))).toBe('x');
		expect(textOf(broken, rangeOfCaret(broken, 5, 5))).toBe('%');
		expect(textOf(broken, rangeOfCaret(broken, 8, 8))).toBe(';');
	});
});

describe('describeSelection', () => {
	it('says where the selection is, its text, and what belongs to it in each phase', () => {
		const source = presetById('factorial-loop')!.value.source;
		const c = compile(source);
		const s = describeSelection(c, find(source, 'n = n - 1;'));
		expect(s.where).toBe('Line 12');
		expect(s.text).toBe('n = n - 1;');
		expect(s.counts).toEqual([
			'6 tokens',
			'6 nodes',
			'1 quad (2 before optimization)',
			'4 instructions'
		]);
		expect(s.sentence).toBe(
			'Line 12: n = n - 1; — 6 tokens, 6 nodes, 1 quad (2 before optimization), 4 instructions'
		);
	});

	it('counts the quads and instructions as generated when the two optimizers change nothing', () => {
		const c = compile(GCD, { optimize: false });
		const s = describeSelection(c, find(GCD, 'return u;'));
		expect(s.sentence).toBe('Line 8: return u; — 3 tokens, 2 nodes, 1 quad, 2 instructions');
	});

	it('adds the count from before the peephole pass when that pass removed something', () => {
		const c = compile(GCD);
		const s = describeSelection(c, find(GCD, 'if (v == 0)'));
		expect(s.counts).toEqual([
			'6 tokens',
			'3 nodes',
			'3 quads (5 before optimization)',
			'9 instructions (10 before the peephole pass)'
		]);
	});

	it('names the lines of a range over several, and shortens long text', () => {
		const c = compile(GCD);
		const gcd = c.parse!.program.decls[0];
		const s = describeSelection(c, rangeOf(gcd.span));
		expect(s.where).toBe('Lines 5–10');
		expect(s.text.endsWith('…')).toBe(true);
		expect(s.text.length).toBeLessThanOrEqual(48);
	});

	it('lists only the phases that were reached', () => {
		const lexical = compile(presetById('illegal-character')!.value.source);
		expect(describeSelection(lexical, find(lexical.source, 'n % 2')).counts).toEqual(['3 tokens']);
		const syntax = compile(presetById('missing-semicolon')!.value.source);
		expect(describeSelection(syntax, find(syntax.source, 'int total;')).counts).toEqual([
			'3 tokens',
			'1 node'
		]);
		const semantic = compile(presetById('undeclared')!.value.source);
		expect(describeSelection(semantic, find(semantic.source, 'output (z);')).counts).toEqual([
			'5 tokens',
			'3 nodes'
		]);
	});
});
