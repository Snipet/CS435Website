/**
 * Semantic analyzer of the tiny compiler: declarations, type checking, and the
 * annotated AST.
 *
 * Types are int and float. An operation with a float operand is a float
 * operation, and its int operands are wrapped in `int2fp` (Intro (cont'd),
 * slide 4: "B1 is int, A and C are floats"). Errors: an undeclared
 * identifier, a float value assigned to an int variable, and an assignment to
 * a declared constant.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { Span } from '$lib/theory/regex/ast';
import { exprText, type BinOp, type Expr, type Program, type RelOp, type Stmt } from './parser';

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
			if (d.type === 'int' && !INT.test(value)) p.value = 'An int constant is a whole number';
			else if (d.type === 'float' && !FLOAT.test(value)) p.value = 'Not a number';
			else constant = Number(value);
		}
		if (p.name || p.value) hasErrors = true;
		if (!p.name) table.set(name, { name, type: d.type, constant });
		problems.push(p);
	}
	return { table, problems, hasErrors };
}

/** Text of a constant as an immediate operand: `#2.3`, `#2`, floats keep a decimal point. */
export function formatConstant(value: number, type: Type): string {
	if (type === 'int') return String(Math.trunc(value));
	if (Number.isInteger(value)) return value.toFixed(1);
	return String(Number(value.toPrecision(12)));
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
	| { kind: 'num'; text: string; value: number; type: Type; span: Span }
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

	function lookup(name: string, span: Span): DeclInfo | null {
		const info = table.get(name) ?? null;
		if (!seen.has(name)) {
			seen.add(name);
			if (info) checks.push({ text: `${name} is declared: ${describe(info)}.`, ok: true });
			else error(`${name} is not declared.`, span);
		}
		return info;
	}

	const toFloat = (e: TExpr): TExpr =>
		e.type === 'int' ? { kind: 'int2fp', arg: e, type: 'float', span: e.span } : e;

	function expr(e: Expr): TExpr {
		if (e.kind === 'num')
			return {
				kind: 'num',
				text: e.text,
				value: e.value,
				type: e.float ? 'float' : 'int',
				span: e.span
			};
		if (e.kind === 'id') {
			const info = lookup(e.name, e.span);
			return {
				kind: 'id',
				name: e.name,
				type: info?.type ?? null,
				constant: info?.constant ?? null,
				span: e.span,
				...(info ? {} : { error: 'not declared' })
			};
		}
		let left = expr(e.left);
		let right = expr(e.right);
		if (left.type === null || right.type === null)
			return { kind: 'bin', op: e.op, left, right, type: null, span: e.span };
		const text = exprText({ ...e, parens: 0 });
		if (left.type === right.type) {
			checks.push({
				text: `${text}: ${left.type} ${e.op} ${right.type} gives ${left.type}.`,
				ok: true
			});
			return { kind: 'bin', op: e.op, left, right, type: left.type, span: e.span };
		}
		const intSide = left.type === 'int' ? e.left : e.right;
		const converted = exprText({ ...intSide, parens: 0 });
		checks.push({
			text: `${text}: ${left.type} ${e.op} ${right.type} gives float; ${converted} is converted with int2fp.`,
			ok: true
		});
		conversions.push(`${converted} is int in the float operation ${text}`);
		left = toFloat(left);
		right = toFloat(right);
		return { kind: 'bin', op: e.op, left, right, type: 'float', span: e.span };
	}

	function stmt(s: Stmt): TStmt {
		if (s.kind === 'if') {
			let left = expr(s.cond.left);
			let right = expr(s.cond.right);
			let operandType: Type | null = null;
			if (left.type !== null && right.type !== null) {
				const text = `${exprText({ ...s.cond.left, parens: 0 })} ${s.cond.op} ${exprText({ ...s.cond.right, parens: 0 })}`;
				if (left.type === right.type) {
					operandType = left.type;
					checks.push({ text: `${text} compares ${left.type} with ${right.type}.`, ok: true });
				} else {
					operandType = 'float';
					const intSide = left.type === 'int' ? s.cond.left : s.cond.right;
					const converted = exprText({ ...intSide, parens: 0 });
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
		let value = expr(s.value);
		const target = {
			name: s.target.name,
			type: info?.type ?? null,
			span: s.target.span,
			...(info ? {} : { error: 'not declared' })
		};
		const node: TStmt = { kind: 'assign', target, value, span: s.span };
		if (!info) return node;
		const name = s.target.name;
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
