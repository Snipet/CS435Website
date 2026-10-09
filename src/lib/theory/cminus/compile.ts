/**
 * The whole C- compiler: source text in, the result of every phase out.
 *
 *   characters → tokens → abstract syntax tree → symbol tables and types
 *     → three-address code → optimized three-address code → TM code
 *
 * Compilation stops at the first phase that reports an error; the phases
 * after it are null and `stoppedAt` names it.
 */
import { hasErrors } from '../diagnostics';
import { generateCode, type CodegenResult, type TmCode } from './codegen';
import { interpret, type InterpretOptions, type InterpretResult } from './interpret';
import { generateIr, type IrProgram } from './ir';
import { optimize, type OptimizeResult } from './optimize';
import { parse, type ParseResult } from './parser';
import { runTM, type RunOptions, type RunResult } from './run';
import { scan, type IdentifierMode, type ScanResult } from './scanner';
import { analyze, type SemanticResult } from './semantic';
import type { SourceDiagnostic } from './tokens';

export type Phase = 'scanner' | 'parser' | 'semantic' | 'ir' | 'optimizer' | 'codegen';

/** The phases in order. */
export const PHASES: readonly Phase[] = [
	'scanner',
	'parser',
	'semantic',
	'ir',
	'optimizer',
	'codegen'
];

export interface CompileOptions {
	/** `letters` (default): ID = letter letter*. `extended`: letter (letter | digit | _)*. */
	identifiers?: IdentifierMode;
	/** Run the optimizer (default true). When false, `optimized` is null and the code is generated from `ir`. */
	optimize?: boolean;
}

export interface PhaseDiagnostic extends SourceDiagnostic {
	/** The phase that reported it. */
	phase: Phase;
}

export interface Compilation {
	source: string;
	options: Required<CompileOptions>;
	scan: ScanResult;
	parse: ParseResult | null;
	semantic: SemanticResult | null;
	/** Three-address code as generated. */
	ir: IrProgram | null;
	/** The optimizer's result; null when it is switched off or was not reached. */
	optimized: OptimizeResult | null;
	/** TM code generated from `optimized.program` (from `ir` when the optimizer is off). */
	codegen: CodegenResult | null;
	/** The phase that reported an error, or null when the program compiled. */
	stoppedAt: Phase | null;
	/** Every phase's diagnostics, in phase order. */
	diagnostics: PhaseDiagnostic[];
}

/**
 * Compiles C- source text. Never throws on any text: what is wrong with the
 * program is in `diagnostics`.
 */
export function compile(source: string, options: CompileOptions = {}): Compilation {
	const opts: Required<CompileOptions> = {
		identifiers: options.identifiers ?? 'letters',
		optimize: options.optimize ?? true
	};
	const c: Compilation = {
		source,
		options: opts,
		scan: scan(source, { identifiers: opts.identifiers }),
		parse: null,
		semantic: null,
		ir: null,
		optimized: null,
		codegen: null,
		stoppedAt: null,
		diagnostics: []
	};
	/** Collects a phase's diagnostics; true when the phase failed. */
	const failed = (phase: Phase, ds: readonly SourceDiagnostic[]): boolean => {
		for (const d of ds) c.diagnostics.push({ ...d, phase });
		if (!hasErrors(ds)) return false;
		c.stoppedAt = phase;
		return true;
	};

	if (failed('scanner', c.scan.diagnostics)) return c;
	c.parse = parse(c.scan.tokens);
	if (failed('parser', c.parse.diagnostics)) return c;
	c.semantic = analyze(c.parse.program);
	if (failed('semantic', c.semantic.diagnostics)) return c;
	c.ir = generateIr(c.parse.program, c.semantic);
	if (opts.optimize) c.optimized = optimize(c.ir, c.semantic);
	c.codegen = generateCode(c.optimized?.program ?? c.ir, c.semantic);
	failed('codegen', c.codegen.diagnostics);
	return c;
}

/** The quads the TM code was generated from: the optimized ones when the optimizer ran. */
export function codeQuads(c: Compilation): IrProgram | null {
	return c.optimized?.program ?? c.ir;
}

/** The TM code to run (after the peephole pass); null when the program did not compile. */
export function finalCode(c: Compilation): TmCode | null {
	return c.stoppedAt === null && c.codegen ? c.codegen.peephole.code : null;
}

/** Runs the compiled program on the TINY Machine; null when it did not compile. */
export function runCompilation(
	c: Compilation,
	inputs: readonly number[],
	options: RunOptions = {}
): RunResult | null {
	const code = finalCode(c);
	return code ? runTM(code, inputs, options) : null;
}

/** Runs the program with the AST interpreter; null when it has scanner, syntax or semantic errors. */
export function interpretCompilation(
	c: Compilation,
	inputs: readonly number[],
	options: InterpretOptions = {}
): InterpretResult | null {
	if (!c.parse || !c.semantic || !c.semantic.ok) return null;
	return interpret(c.parse.program, c.semantic, inputs, options);
}
