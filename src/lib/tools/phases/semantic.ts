/**
 * Semantic analyzer of the tiny compiler: declarations, type checking, and the
 * annotated AST.
 *
 * Types are int and float. An operation with a float operand is a float
 * operation, and its int operands are wrapped in `int2fp` (Intro (cont'd),
 * slide 4: "B1 is int, A and C are floats"). Errors: an undeclared
 * identifier (or one named like a temporary, label, or register), an int
 * literal that does not fit in 32 bits, a float value assigned to an int
 * variable, and an assignment to a declared constant.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Span } from '$lib/theory/regex/ast';
import {
	binaryText,
	clipText,
	type BinOp,
	type Expr,
	type Program,
	type RelOp,
	type Stmt
} from './parser';

export type Type = 'int' | 'float';

/** A row of the declarations table. `value` is '' for a variable. */
export interface Decl {
	name: string;
	type: Type;
	value: string;
}

export interface DeclInfo {
	name: string;
	type: Type;
	/** The constant's value, or null for a variable. */
	constant: number | null;
}

/** Problems with one row of the declarations table. */
export interface DeclProblems {
	name?: string;
	value?: string;
}

export interface DeclCheck {
	table: Map<string, DeclInfo>;
	/** One entry per row, in order. */
	problems: DeclProblems[];
	hasErrors: boolean;
}

const NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const INT = /^[+-]?\d+$/;
const FLOAT = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const KEYWORDS = new Set(['if', 'then', 'else']);

/** An int is a 32-bit longword (MOVL, ADDL2, …). */
export const INT_MIN = -(2 ** 31);
export const INT_MAX = 2 ** 31 - 1;
export const inIntRange = (v: number) => Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX;

/** Names the later phases generate: temporaries, labels, and registers. */
export function reservedFor(name: string): string | null {
	if (/^t\d+$/.test(name)) return 'temporaries';
	if (/^L\d+$/.test(name)) return 'labels';
	if (/^r\d+$/.test(name)) return 'registers';
	return null;
}

/** Validates the declarations table; rows with an empty name are ignored. */
export function checkDeclarations(decls: readonly Decl[]): DeclCheck {
	const table = new Map<string, DeclInfo>();
	const problems: DeclProblems[] = [];
	let hasErrors = false;
	for (const d of decls) {
		const p: DeclProblems = {};
		const name = d.name.trim();
		const value = d.value.trim();
		if (name === '') {
			problems.push(p);
			continue;
		}
		const reserved = reservedFor(name);
		if (!NAME.test(name)) p.name = 'A letter, then letters or digits';
		else if (KEYWORDS.has(name)) p.name = `'${name}' is a keyword`;
		else if (reserved) p.name = `Names like ${name} are reserved for ${reserved}`;
		else if (table.has(name)) p.name = `${name} is already declared`;
		let constant: number | null = null;
		if (value !== '') {
			const v = Number(value);
			if (d.type === 'int' && !INT.test(value)) p.value = 'An int constant is a whole number';
			else if (d.type === 'int' && !inIntRange(v)) p.value = 'Out of range for an int (32 bits)';
			else if (d.type === 'float' && !FLOAT.test(value)) p.value = 'Not a number';
			else if (d.type === 'float' && !Number.isFinite(v)) p.value = 'Too large for a float';
			else constant = v;
		}
		if (p.name || p.value) hasErrors = true;
		if (!p.name) table.set(name, { name, type: d.type, constant });
		problems.push(p);
	}
	return { table, problems, hasErrors };
}

/** `1e+21` → `1000000000000000000000`, `1.5e-7` → `0.00000015`; other text is kept. */
function withoutExponent(text: string): string {
	const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
	if (!m) return text;
	const [, sign, whole, fraction = '', exponent] = m;
	const digits = whole + fraction;
	const point = whole.length + Number(exponent);
	if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
	if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
	return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Text of a constant as an immediate operand, in the literal syntax of the
 * source (no exponent): `#2.3`, `#2`; floats keep a decimal point.
 */
export function formatConstant(value: number, type: Type): string {
	if (type === 'int') return String(Math.trunc(value));
	const text = withoutExponent(String(Number(value.toPrecision(12))));
	return text.includes('.') ? text : `${text}.0`;
}

// ---------------------------------------------------------------------------
// Annotated AST
// ---------------------------------------------------------------------------

/** `type` is null where an error makes it unknown. */
export type TExpr =
	| {
			kind: 'id';
			name: string;
			type: Type | null;
			constant: number | null;
			span: Span;
			/** Set when the identifier is not declared. */
			error?: string;
	  }
	| {
			kind: 'num';
			text: string;
			value: number;
			type: Type;
			span: Span;
			/** Set when an int literal does not fit in 32 bits. */
			error?: string;
	  }
	| { kind: 'bin'; op: BinOp; left: TExpr; right: TExpr; type: Type | null; span: Span }
	| { kind: 'int2fp'; arg: TExpr; type: 'float'; span: Span };

export interface TCond {
	op: RelOp;
	left: TExpr;
	right: TExpr;
	/** Type of the comparison (float when either side is float). */
	operandType: Type | null;
	span: Span;
}

export type TStmt =
	| {
			kind: 'assign';
			target: { name: string; type: Type | null; span: Span; error?: string };
			value: TExpr;
			span: Span;
			/** Set when the assignment itself is not allowed. */
			error?: string;
	  }
	| { kind: 'if'; cond: TCond; then: TStmt; else: TStmt | null; span: Span };

/** One check the analyzer made, in source order (the five-phase view lists them). */
export interface Check {
	text: string;
	ok: boolean;
}

export interface SemanticOutput {
	stmts: TStmt[];
	checks: Check[];
	/** Why each int2fp was inserted, e.g. "B1 is int in the float operation B1 + C". */
	conversions: string[];
	diagnostics: Diagnostic[];
}

export function analyze(program: Program, table: ReadonlyMap<string, DeclInfo>): SemanticOutput {
	const checks: Check[] = [];
	const conversions: string[] = [];
	const diagnostics: Diagnostic[] = [];
	const seen = new Set<string>();

	const error = (message: string, span: Span) => {
		diagnostics.push({ severity: 'error', message, span });
		checks.push({ text: message, ok: false });
	};

	const describe = (info: DeclInfo) =>
		info.constant === null
			? info.type
			: `${info.type} constant ${formatConstant(info.constant, info.type)}`;

	/** Why an identifier has no declaration: `not declared`, or a reserved name. */
	const missing = new Map<string, string>();

	function lookup(name: string, span: Span): DeclInfo | null {
		const info = table.get(name) ?? null;
		if (!seen.has(name)) {
			seen.add(name);
			const shown = clipText(name);
			const reserved = info ? null : reservedFor(name);
			if (info) checks.push({ text: `${shown} is declared: ${describe(info)}.`, ok: true });
			else if (reserved) {
				missing.set(name, 'reserved');
				error(`${shown} is reserved for ${reserved}; use another name.`, span);
			} else {
				missing.set(name, 'not declared');
				error(`${shown} is not declared.`, span);
			}
		}
		return info;
	}

	const toFloat = (e: TExpr): TExpr =>
		e.type === 'int' ? { kind: 'int2fp', arg: e, type: 'float', span: e.span } : e;

	/**
	 * The typed expression and its text for messages. Each node's text is built
	 * from its operands' (cut off at MAX_TEXT), so the analysis stays linear.
	 */
	function expr(e: Expr): { node: TExpr; text: string } {
		if (e.kind === 'num') {
			const text = clipText(e.text);
			const type: Type = e.float ? 'float' : 'int';
			const node: TExpr = { kind: 'num', text: e.text, value: e.value, type, span: e.span };
			if (type === 'int' && !inIntRange(e.value)) {
				node.error = 'out of range';
				error(`${text} is out of range for an int (32 bits).`, e.span);
			}
			return { node, text };
		}
		if (e.kind === 'id') {
			const info = lookup(e.name, e.span);
			const node: TExpr = {
				kind: 'id',
				name: e.name,
				type: info?.type ?? null,
				constant: info?.constant ?? null,
				span: e.span,
				...(info ? {} : { error: missing.get(e.name) ?? 'not declared' })
			};
			return { node, text: clipText(e.name) };
		}
		const l = expr(e.left);
		const r = expr(e.right);
		const text = binaryText(e, l.text, r.text);
		let left = l.node;
		let right = r.node;
		if (left.type === null || right.type === null)
			return { node: { kind: 'bin', op: e.op, left, right, type: null, span: e.span }, text };
		if (left.type === right.type) {
			checks.push({
				text: `${text}: ${left.type} ${e.op} ${right.type} gives ${left.type}.`,
				ok: true
			});
			return {
				node: { kind: 'bin', op: e.op, left, right, type: left.type, span: e.span },
				text
			};
		}
		const converted = left.type === 'int' ? l.text : r.text;
		checks.push({
			text: `${text}: ${left.type} ${e.op} ${right.type} gives float; ${converted} is converted with int2fp.`,
			ok: true
		});
		conversions.push(`${converted} is int in the float operation ${text}`);
		left = toFloat(left);
		right = toFloat(right);
		return { node: { kind: 'bin', op: e.op, left, right, type: 'float', span: e.span }, text };
	}

	function stmt(s: Stmt): TStmt {
		if (s.kind === 'if') {
			const l = expr(s.cond.left);
			const r = expr(s.cond.right);
			let left = l.node;
			let right = r.node;
			let operandType: Type | null = null;
			if (left.type !== null && right.type !== null) {
				const text = `${l.text} ${s.cond.op} ${r.text}`;
				if (left.type === right.type) {
					operandType = left.type;
					checks.push({ text: `${text} compares ${left.type} with ${right.type}.`, ok: true });
				} else {
					operandType = 'float';
					const converted = left.type === 'int' ? l.text : r.text;
					checks.push({
						text: `${text} compares ${left.type} with ${right.type}; ${converted} is converted with int2fp.`,
						ok: true
					});
					conversions.push(`${converted} is int in the float comparison ${text}`);
					left = toFloat(left);
					right = toFloat(right);
				}
			}
			const then = stmt(s.then);
			const other = s.else ? stmt(s.else) : null;
			return {
				kind: 'if',
				cond: { op: s.cond.op, left, right, operandType, span: s.cond.span },
				then,
				else: other,
				span: s.span
			};
		}

		const info = lookup(s.target.name, s.target.span);
		let value = expr(s.value).node;
		const target = {
			name: s.target.name,
			type: info?.type ?? null,
			span: s.target.span,
			...(info ? {} : { error: missing.get(s.target.name) ?? 'not declared' })
		};
		const node: TStmt = { kind: 'assign', target, value, span: s.span };
		if (!info) return node;
		const name = clipText(s.target.name);
		if (info.constant !== null) {
			node.error = `${name} is a constant`;
			error(`${name} is a constant; it cannot be assigned.`, s.target.span);
			return node;
		}
		if (value.type === null) return node;
		if (info.type === 'int' && value.type === 'float') {
			node.error = 'float assigned to int';
			error(`A float value cannot be assigned to ${name}, which is int.`, s.span);
			return node;
		}
		if (info.type === 'float' && value.type === 'int') {
			checks.push({
				text: `${name} = …: an int value assigned to float ${name}; it is converted with int2fp.`,
				ok: true
			});
			conversions.push(`the int value assigned to float ${name}`);
			value = toFloat(value);
			return { ...node, value };
		}
		checks.push({
			text: `${name} = …: ${value.type === 'int' ? 'an' : 'a'} ${value.type} value assigned to ${info.type} ${name}.`,
			ok: true
		});
		return node;
	}

	const stmts = program.stmts.map(stmt);
	return { stmts, checks, conversions, diagnostics };
}
