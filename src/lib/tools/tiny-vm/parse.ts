/**
 * Reads TM program text into instruction memory.
 *
 * Accepted lines (one instruction per line, as tm.c reads them):
 *   `N: OPCODE r,s,t`   RR instructions
 *   `N: OPCODE r,d(s)`  RM and RA instructions
 *   `N: OPCODE r,d,s`   the same, written as on Intro, slide 14 (`LDC 1, 1, 0`)
 *   `N: HALT`           operands default to 0,0,0
 * A line starting with `*` is a comment; text after the operands is a comment
 * too. Blank lines are skipped. Problems are reported as diagnostics with
 * spans into the text.
 */
import type { HighlightToken } from '$lib/components/ui/types';
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Span } from '$lib/theory/regex/ast';
import {
	IADDR_SIZE,
	NO_REGS,
	formatInstruction,
	isOpcode,
	opClass,
	type Instruction,
	type InstructionMemory
} from './machine';

export interface LoadedInstruction {
	addr: number;
	instr: Instruction;
	/** 1-based source line. */
	line: number;
	/** From the address through the last operand. */
	span: Span;
	/** Text after the operands, trimmed ('' when there is none). */
	comment: string;
}

export interface Program extends InstructionMemory {
	/** Loaded instructions in address order (a later line for the same address wins). */
	readonly entries: readonly LoadedInstruction[];
	at(addr: number): LoadedInstruction | undefined;
}

export interface TMParseResult {
	program: Program;
	diagnostics: Diagnostic[];
	/** Syntax coloring for CodeEditor. */
	tokens: HighlightToken[];
}

const INT_MAX = 2 ** 31 - 1;
const INT_MIN = -(2 ** 31);

export function makeProgram(loaded: Iterable<LoadedInstruction>): Program {
	const byAddr = new Map<number, LoadedInstruction>();
	for (const e of loaded) byAddr.set(e.addr, e);
	const entries = [...byAddr.values()].sort((a, b) => a.addr - b.addr);
	return {
		entries,
		at: (addr) => byAddr.get(addr),
		get: (addr) => byAddr.get(addr)?.instr
	};
}

/** Identifies a program by its instructions (not its layout or comments). */
export function programKey(program: Program): string {
	return program.entries.map((e) => `${e.addr}:${formatInstruction(e.instr)}`).join('|');
}

class LineReader {
	i: number;
	constructor(
		readonly text: string,
		start: number,
		readonly end: number
	) {
		this.i = start;
	}
	skipSpace() {
		while (this.i < this.end && (this.text[this.i] === ' ' || this.text[this.i] === '\t')) this.i++;
	}
	get atEnd() {
		return this.i >= this.end;
	}
	get ch() {
		return this.i < this.end ? this.text[this.i] : '';
	}
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => /^[A-Za-z]$/.test(c);

class ParseError {
	constructor(
		readonly message: string,
		readonly span: Span
	) {}
}

/** Parses TM program text. Never throws on user input. */
export function parseTM(text: string): TMParseResult {
	const diagnostics: Diagnostic[] = [];
	const tokens: HighlightToken[] = [];
	const loaded: LoadedInstruction[] = [];
	const lineOfAddr = new Map<number, number>();

	const span = (start: number, end: number): Span => ({ start, end, source: null });
	const tok = (from: number, to: number, className: string) => {
		if (to > from) tokens.push({ from, to, className });
	};

	let lineStart = 0;
	let lineNo = 0;
	while (lineStart <= text.length) {
		lineNo++;
		let lineEnd = text.indexOf('\n', lineStart);
		if (lineEnd === -1) lineEnd = text.length;
		// A Windows line ending leaves '\r' at the end of the line.
		const contentEnd = lineEnd > lineStart && text[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
		const rd = new LineReader(text, lineStart, contentEnd);
		try {
			const entry = parseLine(rd, lineNo);
			if (entry) {
				const prev = lineOfAddr.get(entry.addr);
				if (prev !== undefined) {
					diagnostics.push({
						severity: 'warning',
						message: `Address ${entry.addr} is also loaded on line ${prev}; this line replaces it.`,
						span: entry.addrSpan
					});
				}
				lineOfAddr.set(entry.addr, lineNo);
				loaded.push(entry.loaded);
			}
		} catch (e) {
			if (!(e instanceof ParseError)) throw e;
			diagnostics.push({ severity: 'error', message: e.message, span: e.span });
		}
		lineStart = lineEnd + 1;
	}

	const program = makeProgram(loaded);
	if (program.entries.length === 0 && !diagnostics.some((d) => d.severity === 'error')) {
		diagnostics.push({
			severity: 'info',
			message: 'No instructions: every iMem cell holds HALT 0,0,0.'
		});
	}
	return { program, diagnostics, tokens };

	function readInt(rd: LineReader, what: string): { value: number; start: number; end: number } {
		rd.skipSpace();
		const start = rd.i;
		if (rd.ch === '+' || rd.ch === '-') rd.i++;
		const digits = rd.i;
		while (!rd.atEnd && isDigit(rd.ch)) rd.i++;
		if (rd.i === digits) {
			rd.i = start;
			throw new ParseError(`Expected ${what}.`, wordSpan(rd));
		}
		const value = Number(text.slice(start, rd.i));
		if (value > INT_MAX || value < INT_MIN) {
			throw new ParseError(
				`${cap(what)} ${text.slice(start, rd.i)} does not fit in a 32-bit int.`,
				span(start, rd.i)
			);
		}
		tok(start, rd.i, 'hl-number');
		return { value, start, end: rd.i };
	}

	function readReg(rd: LineReader, what: string): number {
		const n = readInt(rd, `register ${what}`);
		if (n.value < 0 || n.value >= NO_REGS) {
			throw new ParseError(
				`Register ${what} is ${n.value}; registers are 0–${NO_REGS - 1}.`,
				span(n.start, n.end)
			);
		}
		return n.value;
	}

	function expect(rd: LineReader, c: string, message: string) {
		rd.skipSpace();
		if (rd.ch !== c) throw new ParseError(message, pointOrWord(rd));
		tok(rd.i, rd.i + 1, 'hl-punct');
		rd.i++;
	}

	/** The word at the reader (for "expected" errors), or a point at the end of the line. */
	function wordSpan(rd: LineReader): Span {
		let j = rd.i;
		while (j < rd.end && !/[\s,()]/.test(text[j])) j++;
		return span(rd.i, Math.max(j, rd.i + (rd.atEnd ? 0 : 1)));
	}

	function pointOrWord(rd: LineReader): Span {
		return rd.atEnd ? span(rd.i, rd.i) : wordSpan(rd);
	}

	function parseLine(
		rd: LineReader,
		line: number
	): { loaded: LoadedInstruction; addr: number; addrSpan: Span } | null {
		rd.skipSpace();
		if (rd.atEnd) return null;
		if (rd.ch === '*') {
			tok(rd.i, rd.end, 'hl-comment');
			return null;
		}

		// Address.
		const addrStart = rd.i;
		while (!rd.atEnd && isDigit(rd.ch)) rd.i++;
		if (rd.i === addrStart) {
			throw new ParseError(
				'Expected an address, as in "0:  IN 0,0,0" (a line starting with * is a comment).',
				wordSpan(rd)
			);
		}
		const addr = Number(text.slice(addrStart, rd.i));
		const addrSpan = span(addrStart, rd.i);
		if (addr >= IADDR_SIZE) {
			throw new ParseError(`Address ${addr} is outside iMem (0 … ${IADDR_SIZE - 1}).`, addrSpan);
		}
		tok(addrStart, rd.i, 'hl-name');
		expect(rd, ':', `Expected ":" after the address ${addr}.`);

		// Opcode.
		rd.skipSpace();
		const opStart = rd.i;
		while (!rd.atEnd && isLetter(rd.ch)) rd.i++;
		if (rd.i === opStart) throw new ParseError('Expected an opcode.', pointOrWord(rd));
		const word = text.slice(opStart, rd.i);
		const op = word.toUpperCase();
		if (!isOpcode(op)) {
			throw new ParseError(
				`Unknown opcode "${word}". Opcodes: HALT IN OUT ADD SUB MUL DIV LD ST LDA LDC JLT JLE JGT JGE JEQ JNE.`,
				span(opStart, rd.i)
			);
		}
		tok(opStart, rd.i, 'hl-keyword');

		let a1: number, a2: number, a3: number;
		if (opClass(op) === 'RR') {
			rd.skipSpace();
			const bare = op === 'HALT' && !/[0-9+-]/.test(rd.ch);
			if (bare) {
				a1 = a2 = a3 = 0;
			} else {
				a1 = readReg(rd, 'r');
				expect(rd, ',', 'Expected "," after register r (RR operands are r,s,t).');
				a2 = readReg(rd, 's');
				expect(rd, ',', 'Expected "," after register s (RR operands are r,s,t).');
				a3 = readReg(rd, 't');
			}
		} else {
			a1 = readReg(rd, 'r');
			expect(rd, ',', `Expected "," after register r (${op} operands are r,d(s)).`);
			a2 = readInt(rd, 'the offset d').value;
			rd.skipSpace();
			if (rd.ch === '(') {
				tok(rd.i, rd.i + 1, 'hl-punct');
				rd.i++;
				a3 = readReg(rd, 's');
				expect(rd, ')', 'Expected ")" after register s.');
			} else if (rd.ch === ',') {
				tok(rd.i, rd.i + 1, 'hl-punct');
				rd.i++;
				a3 = readReg(rd, 's');
			} else {
				throw new ParseError(
					`Expected "(" after the offset, as in ${op} ${a1},${a2}(s).`,
					pointOrWord(rd)
				);
			}
		}
		const instrEnd = rd.i;

		// The rest of the line is a comment.
		rd.skipSpace();
		const commentStart = rd.i;
		const comment = text.slice(commentStart, rd.end).trim();
		if (comment) {
			tok(commentStart, rd.end, 'hl-comment');
			if (/^[,()0-9+-]/.test(comment)) {
				diagnostics.push({
					severity: 'warning',
					message: `"${comment}" after the operands is read as a comment.`,
					span: span(commentStart, rd.end)
				});
			}
		}

		return {
			addr,
			addrSpan,
			loaded: {
				addr,
				instr: { op, a1, a2, a3 },
				line,
				span: span(addrStart, instrEnd),
				comment
			}
		};
	}
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let cache: { text: string; result: TMParseResult } | null = null;

/** `parseTM` with a one-entry cache (the editor's highlighter and the page parse the same text). */
export function parseTMCached(text: string): TMParseResult {
	if (cache?.text !== text) cache = { text, result: parseTM(text) };
	return cache.result;
}

/** Syntax coloring for CodeEditor's `highlight` prop. */
export function highlightTM(text: string): HighlightToken[] {
	return parseTMCached(text).tokens;
}
