/**
 * The whole tiny compiler: source text and declarations in, the output of
 * every phase out. Compilation stops at the first phase that reports an error;
 * later phases are then null.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { parse, type ParseOutput } from './parser';
import { scan, type ScanOutput } from './scanner';
import {
	analyze,
	checkDeclarations,
	type Decl,
	type DeclCheck,
	type SemanticOutput
} from './semantic';
import { generateTac, optimizeTac, type OptimizeOutput, type Quad } from './tac';
import { generateCode, peephole, type Instr, type PeepholeOutput } from './vax';

export type PhaseId =
	'scanner' | 'parser' | 'semantic' | 'icg' | 'optimizer' | 'codegen' | 'peephole';

/** Longest source compiled; longer text is cut off with a note. */
export const MAX_SOURCE = 4000;

export interface Compilation {
	source: string;
	/** True when the source was longer than MAX_SOURCE and only its start was compiled. */
	truncated: boolean;
	declarations: DeclCheck;
	scan: ScanOutput;
	parse: ParseOutput | null;
	semantic: SemanticOutput | null;
	tac: Quad[] | null;
	optimized: OptimizeOutput | null;
	code: Instr[] | null;
	peephole: PeepholeOutput | null;
	/** The phase that reported an error, or null when every phase ran. */
	stoppedAt: PhaseId | null;
	/** Problems in the source text (scanner, parser, semantic analyzer). */
	diagnostics: Diagnostic[];
}

export function compile(source: string, decls: readonly Decl[]): Compilation {
	const truncated = source.length > MAX_SOURCE;
	const text = truncated ? source.slice(0, MAX_SOURCE) : source;
	const declarations = checkDeclarations(decls);
	const result: Compilation = {
		source: text,
		truncated,
		declarations,
		scan: scan(text),
		parse: null,
		semantic: null,
		tac: null,
		optimized: null,
		code: null,
		peephole: null,
		stoppedAt: null,
		diagnostics: []
	};
	result.diagnostics.push(...result.scan.diagnostics);
	if (result.scan.diagnostics.some((d) => d.severity === 'error')) {
		result.stoppedAt = 'scanner';
		return result;
	}
	result.parse = parse(result.scan.tokens, text.length);
	result.diagnostics.push(...result.parse.diagnostics);
	if (!result.parse.program) {
		result.stoppedAt = 'parser';
		return result;
	}
	result.semantic = analyze(result.parse.program, declarations.table);
	result.diagnostics.push(...result.semantic.diagnostics);
	if (result.semantic.diagnostics.some((d) => d.severity === 'error') || declarations.hasErrors) {
		result.stoppedAt = 'semantic';
		return result;
	}
	result.tac = generateTac(result.semantic.stmts);
	result.optimized = optimizeTac(result.tac, declarations.table);
	result.code = generateCode(result.optimized.quads);
	result.peephole = peephole(result.code);
	return result;
}
