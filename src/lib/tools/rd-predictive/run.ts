/**
 * Runs the generated code (codegen.ts, ast.ts) on a token string that ends in
 * `$`, and records one step for everything that happens: a function is
 * entered or left, a test of `token` is evaluated, a `match` advances the
 * input, `error ("X")` stops the run. Every step names its line of the code.
 *
 * The code has no state but the input position (and, in the functions that
 * build an AST, their local variables), so a function that is called again
 * with the token where it was for a call of it still in progress will be
 * called that way for ever. This is what a left-recursive rule does (Top-Down
 * Parsing, slide 23); the run stops once `nesting` such calls are nested.
 *
 * The run keeps its own stack of calls, so long and deeply nested input does
 * not use the stack of the JavaScript engine, and it stops after `maxSteps`
 * steps whatever the code does.
 */
import { END_MARKER } from '$lib/theory/grammar/types';
import type { Program, Stmt, Target } from './program';

/** Steps recorded before a run is stopped. */
export const DEFAULT_MAX_STEPS = 20000;
/** Calls of one function, nested with no token matched between them, at which a run stops. */
export const DEFAULT_NESTING = 8;

/**
 * A call in progress. Frames are never changed: a step keeps the frame that
 * was innermost when it was recorded, and `parent` leads to the outer calls.
 */
export interface Frame {
	/** Index of the function in the program. */
	fn: number;
	/** The line of the call in the calling function; null for the outermost call. */
	site: number | null;
	/** Index of the next token when the function was entered. */
	entered: number;
	/** Local variables: the id of the node each points to; null before it has a value. */
	vars: Readonly<Record<string, number | null>>;
	parent: Frame | null;
	/** 1 for the outermost call. */
	depth: number;
}

/** What a step did. */
export type StepEvent =
	/** The outermost function starts. */
	| { kind: 'start'; fn: number }
	/** `fn` is called from the function `from` and entered. */
	| { kind: 'enter'; fn: number; from: number }
	/** A test of `token` in an if (`loop` false) or a while. */
	| { kind: 'test'; test: string; tokens: string[]; result: boolean; loop: boolean }
	/** A match that succeeds: the input pointer advances. */
	| { kind: 'match'; terminal: string; text: string }
	/** `fn` returns to `to` (null: to no function, the run is over); `value` is the node returned. */
	| { kind: 'leave'; fn: number; to: number | null; value: number | null }
	/** `makeNode (…)`: the new node `node` is stored in `target`. */
	| { kind: 'make'; node: number; label: string; target: Target }
	/** `target = from;` */
	| { kind: 'assign'; from: string; node: number | null; target: Target }
	/** The node the call of `fn` returned is stored in `target`. */
	| { kind: 'store'; fn: number; node: number | null; target: Target }
	/** `error ("name")`: the run stops. */
	| { kind: 'error'; name: string }
	/** A match that fails: the token is not `terminal`. The run stops. */
	| { kind: 'mismatch'; terminal: string; text: string }
	/** `fn` is entered for the `nested`-th time with no token matched in between. The run stops. */
	| { kind: 'loop'; fn: number; nested: number }
	/** The run is stopped after `limit` steps. */
	| { kind: 'limit'; limit: number };

export type Step = StepEvent & {
	/** The line of the code the step executes. */
	line: number;
	/** Index of the next token after the step; `tokens.length` once `$` is matched. */
	pointer: number;
	/** The innermost call while the line executes (the function being left, for `leave`). */
	stack: Frame;
	/** Number of `events` that have happened after the step. */
	heap: number;
};

export type StepKind = Step['kind'];

/** A change to the nodes of the AST. */
export type HeapEvent =
	/** A new node; `token` is the index of the token it stands for. */
	| { kind: 'node'; id: number; label: string; token: number }
	| { kind: 'set'; node: number; field: 'left' | 'right'; child: number | null };

/**
 * How a run ended. `accept`: main returned with every token matched. `done`:
 * the outermost function returned (code without main, or tokens left over).
 */
export type Outcome = 'accept' | 'done' | 'error' | 'mismatch' | 'loop' | 'limit';

export interface RunResult {
	program: Program;
	/** The token string that was run, ending in `$`. */
	tokens: string[];
	steps: Step[];
	outcome: Outcome;
	/** The functions in the order they were entered. */
	calls: number[];
	/** Every change to the nodes, in order; a step's `heap` counts into it. */
	events: HeapEvent[];
	/** The node the outermost function returned. */
	result: number | null;
}

export interface RunOptions {
	maxSteps?: number;
	nesting?: number;
}

/** `tokens` ending in `$`: the marker is added unless the last token is one. */
export function withEndMarker(tokens: readonly string[]): string[] {
	return tokens[tokens.length - 1] === END_MARKER ? [...tokens] : [...tokens, END_MARKER];
}

/** The calls in progress at a step, innermost first. */
export function framesOf(step: Step): Frame[] {
	const out: Frame[] = [];
	for (let f: Frame | null = step.stack; f; f = f.parent) out.push(f);
	return out;
}

/** The tokens a run had not read when it ended, without the closing `$`. */
export function leftOver(result: RunResult): string[] {
	const last = result.steps[result.steps.length - 1];
	return last ? result.tokens.slice(last.pointer, -1) : [];
}

/** The names of the functions a run entered, in order: `main`, `E`, `T`, `T`. */
export function callNames(result: RunResult): string[] {
	return result.calls.map((fn) => result.program.functions[fn].name);
}

/** Where execution is inside one block of statements. */
interface Cursor {
	body: readonly Stmt[];
	at: number;
	/** The while whose body this is: its test is evaluated again at the end. */
	loop: Extract<Stmt, { kind: 'while' }> | null;
}

interface Activation {
	fn: number;
	frame: Frame;
	cursors: Cursor[];
	/** Where the caller stores the node this call returns. */
	target: Target | undefined;
	/** Function and input position at entry, for the nesting count. */
	key: string;
}

/**
 * Runs `program` on `input` (`$` is added at the end if it is missing),
 * starting with main, or with the start symbol's function when the code has
 * no main.
 */
export function runProgram(
	program: Program,
	input: readonly string[],
	opts: RunOptions = {}
): RunResult {
	const tokens = withEndMarker(input);
	const maxSteps = Math.max(2, Math.floor(opts.maxSteps ?? DEFAULT_MAX_STEPS));
	const nesting = Math.max(2, Math.floor(opts.nesting ?? DEFAULT_NESTING));
	const steps: Step[] = [];
	const events: HeapEvent[] = [];
	const calls: number[] = [];
	const stack: Activation[] = [];
	/** Calls in progress by function and input position at entry. */
	const active = new Map<string, number>();
	let pointer = 0;
	let nodes = 0;
	// Set by the functions below: the casts keep the declared types through the loop.
	let outcome = null as Outcome | null;
	let result = null as number | null;

	const top = (): Activation => stack[stack.length - 1];
	const record = (event: StepEvent, line: number, frame: Frame = top().frame): void => {
		steps.push({ ...event, line, pointer, stack: frame, heap: events.length });
	};
	const holds = (expected: readonly string[]): boolean =>
		pointer < tokens.length && expected.includes(tokens[pointer]);

	const write = (target: Target, value: number | null): void => {
		const act = top();
		if (target.kind === 'variable') {
			act.frame = { ...act.frame, vars: { ...act.frame.vars, [target.name]: value } };
			return;
		}
		const node = act.frame.vars[target.object];
		if (node === null || node === undefined) return;
		events.push({ kind: 'set', node, field: target.field, child: value });
	};

	const call = (fn: number, site: number | null, target: Target | undefined): void => {
		const f = program.functions[fn];
		const caller = stack.length > 0 ? top() : null;
		const key = `${fn}@${pointer}`;
		const nested = (active.get(key) ?? 0) + 1;
		active.set(key, nested);
		const frame: Frame = {
			fn,
			site,
			entered: pointer,
			vars: {},
			parent: caller?.frame ?? null,
			depth: (caller?.frame.depth ?? 0) + 1
		};
		stack.push({ fn, frame, cursors: [{ body: f.body, at: 0, loop: null }], target, key });
		calls.push(fn);
		record(caller ? { kind: 'enter', fn, from: caller.fn } : { kind: 'start', fn }, f.head);
		if (nested >= nesting) {
			record({ kind: 'loop', fn, nested }, f.head);
			outcome = 'loop';
		}
	};

	const leave = (value: number | null, line: number): void => {
		const act = stack.pop()!;
		const caller = stack.length > 0 ? top() : null;
		active.set(act.key, (active.get(act.key) ?? 1) - 1);
		record({ kind: 'leave', fn: act.fn, to: caller?.fn ?? null, value }, line, act.frame);
		if (!caller) {
			result = value;
			outcome = program.main >= 0 && pointer === tokens.length ? 'accept' : 'done';
			return;
		}
		if (act.target && act.frame.site !== null) {
			write(act.target, value);
			record({ kind: 'store', fn: act.fn, node: value, target: act.target }, act.frame.site);
		}
	};

	const execute = (stmt: Stmt): void => {
		const act = top();
		switch (stmt.kind) {
			case 'call':
				call(stmt.fn, stmt.line, stmt.target);
				return;
			case 'match':
				if (pointer < tokens.length && tokens[pointer] === stmt.terminal) {
					pointer++;
					record({ kind: 'match', terminal: stmt.terminal, text: stmt.text }, stmt.line);
				} else {
					record({ kind: 'mismatch', terminal: stmt.terminal, text: stmt.text }, stmt.line);
					outcome = 'mismatch';
				}
				return;
			case 'if': {
				for (const arm of stmt.arms) {
					const yes = holds(arm.tokens);
					record(
						{ kind: 'test', test: arm.test, tokens: arm.tokens, result: yes, loop: false },
						arm.line
					);
					if (yes) {
						act.cursors.push({ body: arm.body, at: 0, loop: null });
						return;
					}
				}
				if (stmt.otherwise) act.cursors.push({ body: stmt.otherwise.body, at: 0, loop: null });
				return;
			}
			case 'while': {
				const yes = holds(stmt.tokens);
				record(
					{ kind: 'test', test: stmt.test, tokens: stmt.tokens, result: yes, loop: true },
					stmt.line
				);
				if (yes) act.cursors.push({ body: stmt.body, at: 0, loop: stmt });
				return;
			}
			case 'error':
				record({ kind: 'error', name: stmt.name }, stmt.line);
				outcome = 'error';
				return;
			case 'declare':
				write({ kind: 'variable', name: stmt.name, declares: true }, null);
				return;
			case 'make': {
				const id = nodes++;
				// A node for the token itself is made before the match; an operator's after it.
				const label = stmt.label ?? tokens[Math.min(pointer, tokens.length - 1)];
				const token = stmt.leaf ? pointer : pointer - 1;
				events.push({ kind: 'node', id, label, token });
				write(stmt.target, id);
				record({ kind: 'make', node: id, label, target: stmt.target }, stmt.line);
				return;
			}
			case 'assign': {
				const node = act.frame.vars[stmt.from] ?? null;
				write(stmt.target, node);
				record({ kind: 'assign', from: stmt.from, node, target: stmt.target }, stmt.line);
				return;
			}
			case 'return':
				leave(act.frame.vars[stmt.name] ?? null, stmt.line);
				return;
		}
	};

	const entry = program.main >= 0 ? program.main : program.start;
	if (program.functions[entry] === undefined) {
		return { program, tokens, steps, outcome: 'done', calls, events, result };
	}
	call(entry, null, undefined);

	while (outcome === null) {
		if (steps.length >= maxSteps) {
			record({ kind: 'limit', limit: maxSteps }, steps[steps.length - 1].line);
			outcome = 'limit';
			break;
		}
		const act = top();
		const cursor = act.cursors[act.cursors.length - 1];
		if (cursor.at < cursor.body.length) {
			execute(cursor.body[cursor.at++]);
			continue;
		}
		act.cursors.pop();
		if (cursor.loop) {
			// The end of a loop body: the test again.
			const loop = cursor.loop;
			const yes = holds(loop.tokens);
			record(
				{ kind: 'test', test: loop.test, tokens: loop.tokens, result: yes, loop: true },
				loop.line
			);
			if (yes) act.cursors.push({ body: loop.body, at: 0, loop });
			continue;
		}
		// The end of the function's own statements: it returns at its closing brace.
		if (act.cursors.length === 0) leave(null, program.functions[act.fn].close);
	}

	return { program, tokens, steps, outcome, calls, events, result };
}
