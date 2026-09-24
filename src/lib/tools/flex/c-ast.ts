/** Syntax tree of the C subset used in flex actions and user code. */

/** Offsets into the spec text. */
export interface Loc {
	start: number;
	end: number;
}

export type Base =
	| 'void'
	| 'char'
	| 'uchar'
	| 'short'
	| 'ushort'
	| 'int'
	| 'uint'
	| 'long'
	| 'ulong'
	| 'double'
	| 'FILE';

/** A C type: a base type plus a pointer depth (`char *` = { base: 'char', ptr: 1 }). */
export interface CType {
	base: Base;
	ptr: number;
}

export const INT: CType = { base: 'int', ptr: 0 };
export const DOUBLE: CType = { base: 'double', ptr: 0 };
export const CHAR_PTR: CType = { base: 'char', ptr: 1 };

export type Expr =
	| { k: 'num'; v: number; float: boolean; loc: Loc }
	| { k: 'char'; v: number; loc: Loc }
	| { k: 'str'; v: string; loc: Loc }
	| { k: 'id'; name: string; loc: Loc }
	| { k: 'unary'; op: '-' | '+' | '!' | '~' | '*' | '&'; arg: Expr; loc: Loc }
	| { k: 'incdec'; op: '++' | '--'; prefix: boolean; arg: Expr; loc: Loc }
	| { k: 'binary'; op: string; left: Expr; right: Expr; loc: Loc }
	| { k: 'logical'; op: '&&' | '||'; left: Expr; right: Expr; loc: Loc }
	| { k: 'assign'; op: string; target: Expr; value: Expr; loc: Loc }
	| { k: 'cond'; test: Expr; then: Expr; else: Expr; loc: Loc }
	| { k: 'call'; name: string; args: Expr[]; loc: Loc; nameLoc: Loc }
	| { k: 'index'; arr: Expr; index: Expr; loc: Loc }
	| { k: 'cast'; type: CType; arg: Expr; loc: Loc }
	| { k: 'sizeof'; type: CType | null; arg: Expr | null; loc: Loc }
	| { k: 'comma'; items: Expr[]; loc: Loc }
	/** flex's BEGIN x (a macro for setting the start condition). */
	| { k: 'begin'; arg: Expr; loc: Loc };

/** `{ a, b, c }` initializer. */
export interface InitList {
	k: 'list';
	items: Expr[];
	loc: Loc;
}

export interface Declarator {
	name: string;
	type: CType;
	/** Array length expression; `null` for `[]` (size from the initializer); undefined for scalars. */
	array?: Expr | null;
	init?: Expr | InitList;
	loc: Loc;
}

export type Stmt =
	| { k: 'expr'; e: Expr; loc: Loc }
	| { k: 'decl'; decls: Declarator[]; extern?: boolean; loc: Loc }
	| { k: 'enum'; items: { name: string; value: Expr | null; loc: Loc }[]; loc: Loc }
	| { k: 'block'; body: Stmt[]; loc: Loc }
	| { k: 'if'; test: Expr; then: Stmt; else: Stmt | null; loc: Loc }
	| { k: 'while'; test: Expr; body: Stmt; loc: Loc }
	| { k: 'do'; body: Stmt; test: Expr; loc: Loc }
	| { k: 'for'; init: Stmt | null; test: Expr | null; update: Expr | null; body: Stmt; loc: Loc }
	| { k: 'return'; e: Expr | null; loc: Loc }
	| { k: 'break'; loc: Loc }
	| { k: 'continue'; loc: Loc }
	| { k: 'switch'; e: Expr; body: Stmt[]; loc: Loc }
	| { k: 'case'; e: Expr; loc: Loc }
	| { k: 'default'; loc: Loc }
	| { k: 'empty'; loc: Loc };

export interface Param {
	name: string | null;
	type: CType;
}

export interface FnDef {
	name: string;
	ret: CType;
	params: Param[];
	variadic: boolean;
	body: Stmt[];
	loc: Loc;
	nameLoc: Loc;
}

/** Top-level items of a code block, in order. */
export type TopItem =
	{ k: 'global'; stmt: Stmt } | { k: 'fn'; fn: FnDef } | { k: 'proto'; name: string; loc: Loc };

export const typeName = (t: CType): string => {
	const base: Record<Base, string> = {
		void: 'void',
		char: 'char',
		uchar: 'unsigned char',
		short: 'short',
		ushort: 'unsigned short',
		int: 'int',
		uint: 'unsigned',
		long: 'long',
		ulong: 'unsigned long',
		double: 'double',
		FILE: 'FILE'
	};
	return base[t.base] + (t.ptr ? ' ' + '*'.repeat(t.ptr) : '');
};
