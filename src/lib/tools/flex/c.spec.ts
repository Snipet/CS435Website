import { describe, expect, it } from 'vitest';
import { CLimitError, CMachine, CRuntimeError, type FlexHooks } from './c';
import { GLOBAL_CHECK_MEMORY } from './c-check';
import { formatC, type FormatArg } from './c-format';
import { hasCurlyQuotes, straightenQuotes } from './c-lexer';
import { compileSpec } from './program';
import { outputText, runScanner, type FlexRun } from './runtime';

/** Runs C user code (with an empty rules section) and returns the run. */
function runC(code: string, input = '', budget?: number): FlexRun {
	const compiled = compileSpec(`%%\n%%\n${code}`);
	const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
	if (errors.length) throw new Error(errors.map((d) => d.message).join('; '));
	return runScanner(compiled, input, { budget });
}

const out = (code: string, input = '') => outputText(runC(code, input), 'stdout');
const main = (body: string) => `#include <stdio.h>\nint main() {\n${body}\nreturn 0;\n}\n`;

/** Compile-time diagnostics (messages) for C user code. */
function compileErrors(code: string): string[] {
	return compileSpec(`%%\n%%\n${code}`)
		.diagnostics.filter((d) => d.severity === 'error')
		.map((d) => d.message);
}

function fmt(f: string, ...args: (number | string | { d: number })[]): string {
	const list: FormatArg[] = args.map((a) =>
		typeof a === 'string'
			? { t: 'str', v: a }
			: typeof a === 'number'
				? { t: 'int', v: a }
				: { t: 'double', v: a.d }
	);
	let k = 0;
	return formatC(f, () => list[k++]).text;
}

describe('printf formatting', () => {
	it('formats integers with width, flags, and precision', () => {
		expect(fmt('%d|%5d|%-5d|%05d|%+d|% d', 42, 42, 42, 42, 42, 42)).toBe(
			'42|   42|42   |00042|+42| 42'
		);
		expect(fmt('%8d%8d%8d', 1, 2, 12)).toBe('       1       2      12');
		expect(fmt('%.3d|%i|%ld|%u', 7, -5, 123456789012, -1)).toBe('007|-5|123456789012|4294967295');
		expect(fmt('%x|%X|%#x|%o|%#o', 255, 255, 255, 8, 8)).toBe('ff|FF|0xff|10|010');
		expect(fmt('%*d|%-*d|', 4, 7, 3, 7)).toBe('   7|7  |');
	});

	it('formats characters and strings', () => {
		expect(fmt('%c%c', 104, 105)).toBe('hi');
		expect(fmt('[%s] [%6s] [%-6s] [%.2s]', 'abc', 'abc', 'abc', 'abc')).toBe(
			'[abc] [   abc] [abc   ] [ab]'
		);
		expect(fmt('100%%')).toBe('100%');
	});

	it('formats doubles like C (%f, %e, %g)', () => {
		expect(fmt('%f|%.2f|%8.3f|%.0f', { d: 3.14159 }, { d: 2.5 }, { d: -1.5 }, { d: 2.5 })).toBe(
			'3.141590|2.50|  -1.500|2'
		);
		expect(fmt('%.0f %.0f %.0f', { d: 0.5 }, { d: 1.5 }, { d: 3.5 })).toBe('0 2 4');
		expect(fmt('%e|%.2E', { d: 12345.678 }, { d: 0.000123 })).toBe('1.234568e+04|1.23E-04');
		expect(
			fmt('%g|%g|%g|%g|%g', { d: 100 }, { d: 0.0001 }, { d: 1e-5 }, { d: 123456789 }, { d: 7.5 })
		).toBe('100|0.0001|1e-05|1.23457e+08|7.5');
		expect(fmt('%.3g|%#g|%g', { d: 3.14159 }, { d: 1 }, { d: 0 })).toBe('3.14|1.00000|0');
	});

	it('reports missing arguments and unknown conversions', () => {
		expect(formatC('%d %d', () => undefined).error).toMatch(/no argument/);
		expect(formatC('%y', () => undefined).error).toMatch(/unknown conversion/);
		expect(formatC('%d', () => ({ t: 'double', v: 1.5 })).warnings[0]).toMatch(/integer/);
	});
});

describe('C expressions', () => {
	it('does integer and double arithmetic with C semantics', () => {
		expect(out(main('printf("%d %d %d %d %d\\n", 7 / 2, -7 / 2, 7 % 3, -7 % 3, 1 + 2 * 3);'))).toBe(
			'3 -3 1 -1 7\n'
		);
		expect(out(main('double x = 7 / 2; double y = 7 / 2.0; printf("%g %g\\n", x, y);'))).toBe(
			'3 3.5\n'
		);
		expect(out(main('int i = 3.9; char c = 300; printf("%d %d\\n", i, c);'))).toBe('3 44\n');
		expect(out(main('printf("%d %d %d\\n", 1 << 4, 0xff & 0x0f, 5 ^ 1);'))).toBe('16 15 4\n');
	});

	it('evaluates comparisons, logic with short-circuit, and ?:', () => {
		const code = `
			int calls = 0;
			int f() { calls++; return 1; }
			int main() {
				int a = 0 && f();
				int b = 1 || f();
				int c = 1 && f();
				printf("%d %d %d %d %d\\n", a, b, c, calls, 3 > 2 ? 10 : 20);
				printf("%d %d %d\\n", !0, !5, (1 < 2) == (2 < 3));
				return 0;
			}`;
		expect(out(code)).toBe('0 1 1 1 10\n1 0 1\n');
	});

	it('handles assignment operators and ++/--', () => {
		expect(
			out(
				main(`
					int x = 5, y;
					x += 3; x -= 1; x *= 2; x /= 3; x %= 3;
					y = x++;
					printf("%d %d ", x, y);
					y = ++x;
					printf("%d %d ", x, y);
					y = x--; printf("%d %d ", x, y);
					y = --x; printf("%d %d\\n", x, y);
				`)
			)
		).toBe('2 1 3 3 2 3 1 1\n');
	});

	it('works with characters, strings, and arrays', () => {
		expect(
			out(
				main(`
					char s[16] = "flex";
					int counts[3] = { 1, 2 };
					int squares[] = { 0, 1, 4, 9 };
					char *p = s;
					s[0] = 'F';
					counts[2] = counts[0] + counts[1];
					printf("%s %c %d %d %d %d\\n", s, *(p + 1), counts[2], squares[3], (int) sizeof squares, (int) strlen(p));
					printf("%d %d\\n", 'a', '\\n');
				`)
			)
		).toBe('Flex l 3 9 16 4\n97 10\n');
	});

	it('supports string library functions', () => {
		expect(
			out(
				main(`
					char buf[32];
					char *d;
					strcpy(buf, "abc");
					strcat(buf, "def");
					d = strdup(buf);
					d[0] = 'X';
					printf("%s %s %d %d %d\\n", buf, d, strcmp("a", "b"), strcmp("b", "a"), strcmp(buf, "abcdef"));
					printf("%d %g %d %s\\n", atoi("  -42x"), atof("2.5e1"), strncmp("abcd", "abce", 3), strchr(buf, 'd'));
					printf("%d %d %c %c\\n", isdigit('7'), isalpha('7'), toupper('q'), tolower('Q'));
					sprintf(buf, "%03d-%s", 7, "x");
					puts(buf);
					putchar('!'); putchar('\\n');
				`)
			)
		).toBe('abcdef Xbcdef -1 1 0\n-42 25 0 def\n1 0 Q q\n007-x\n!\n');
	});

	it('supports enum, #define, typedef, and casts', () => {
		const code = `
			#include <stdio.h>
			#define LIMIT 3
			#define GREETING "hi"
			enum color { RED, GREEN = 5, BLUE };
			typedef int count_t;
			int main() {
				count_t n = LIMIT;
				printf("%d %d %d %d %s %d\\n", RED, GREEN, BLUE, n, GREETING, (int) 3.7);
				printf("%.1f\\n", (double) 7 / 2);
				return 0;
			}`;
		expect(out(code)).toBe('0 5 6 3 hi 3\n3.5\n');
	});

	it('keeps a variable declared with its enum in scope', () => {
		expect(out(main('enum { A, B } x = B; x++; printf("%d %d\\n", x, A);'))).toBe('2 0\n');
		const compiled = compileSpec(
			'%%\n\tenum { OFF, ON } mode = ON;\nx  { printf("%d", mode); }\n%%\n'
		);
		expect(compiled.ok).toBe(true);
		expect(outputText(runScanner(compiled, 'x'))).toBe('1');
	});

	it('applies #define and #undef from where they appear', () => {
		const spec = `%{
#define N 10
int a = N;
#undef N
#define N 20
int b = N;
%}
%%
%%
#define TWICE N * 2
int c = TWICE;
#undef N
#define N 1
int main() { printf("%d %d %d %d\\n", a, b, c, TWICE); return 0; }
`;
		const compiled = compileSpec(spec);
		expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
		expect(outputText(runScanner(compiled, ''))).toBe('10 20 40 2\n');
		// A name used before its #define is not replaced.
		expect(compileErrors('int f(void) { return LATER; }\n#define LATER 1\n')).toEqual([
			'LATER is undeclared'
		]);
	});
});

describe('C statements', () => {
	it('runs if/else, while, do-while, for, break, continue', () => {
		expect(
			out(
				main(`
					int i, sum = 0;
					for (i = 0; i < 10; i++) {
						if (i == 7) break;
						if (i % 2) continue;
						sum += i;
					}
					printf("%d ", sum);
					i = 0;
					while (i < 3) i++;
					do { i += 10; } while (i < 5);
					printf("%d ", i);
					for (int k = 0; k < 3; k++) printf("%d", k);
					if (sum > 100) printf("big"); else if (sum > 5) printf(" mid"); else printf(" small");
					printf("\\n");
				`)
			)
		).toBe('12 13 012 mid\n');
	});

	it('runs switch with fall-through and default', () => {
		const code = `
			#include <stdio.h>
			const char *kind(int c) {
				switch (c) {
				case '+': case '-': return "additive";
				case '*': return "multiplicative";
				default: return "other";
				}
			}
			int main() {
				int n = 0;
				switch (2) { case 1: n += 1; case 2: n += 2; case 3: n += 3; break; case 4: n += 4; }
				printf("%s %s %s %d\\n", kind('-'), kind('*'), kind('x'), n);
				return 0;
			}`;
		expect(out(code)).toBe('additive multiplicative other 5\n');
	});

	it('calls functions with parameters and recursion', () => {
		const code = `
			#include <stdio.h>
			int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
			void greet(char *who) { printf("hello, %s\\n", who); }
			int main(int argc, char *argv[]) {
				greet("flex");
				printf("%d %d %s\\n", fact(5), argc, argv[0]);
				return 3;
			}`;
		const run = runC(code);
		expect(outputText(run)).toBe('hello, flex\n120 1 ./a.out\n');
		expect(run.exitStatus).toBe(3);
	});

	it('keeps static local variables between calls', () => {
		const code = `
			#include <stdio.h>
			int counter(void) { static int n = 0; return ++n; }
			int ids(void) { static int next = 100, seen[3]; seen[next % 3]++; return next++; }
			int fresh(void) { int n = 0; return ++n; }
			int main() {
				counter(); counter();
				printf("%d %d|", counter(), fresh() + fresh());
				ids(); ids();
				printf("%d\\n", ids());
				return 0;
			}`;
		expect(out(code)).toBe('3 2|102\n');
	});

	it('keeps a static in an action between matches', () => {
		const compiled = compileSpec(
			'%%\n.  { static int n = 0; n++; printf("%d ", n); }\n\\n { }\n%%\n'
		);
		expect(compiled.ok).toBe(true);
		expect(outputText(runScanner(compiled, 'abc\n'))).toBe('1 2 3 ');
		// Each run starts over.
		expect(outputText(runScanner(compiled, 'ab\n'))).toBe('1 2 ');
	});

	it('keeps a static in the code before the first rule between yylex calls', () => {
		const spec = `%%
	static int calls = 0;
	calls++;
[a-z]+  { printf("%d:%s ", calls, yytext); return 1; }
\\n      { }
%%
`;
		const compiled = compileSpec(spec);
		expect(compiled.ok).toBe(true);
		// The blank is ECHOed by the default rule inside the second call.
		expect(outputText(runScanner(compiled, 'ab cd\n'))).toBe('1:ab  2:cd ');
		expect(runScanner(compiled, 'ab cd\n').calls.length).toBe(3);
	});

	it('writes stderr separately and stops at exit()', () => {
		const run = runC(
			main(
				'printf("a"); fprintf(stderr, "oops\\n"); fprintf(stdout, "b"); exit(4); printf("never");'
			)
		);
		expect(outputText(run, 'stdout')).toBe('ab');
		expect(outputText(run, 'stderr')).toBe('oops\n');
		expect(run.exitStatus).toBe(4);
	});
});

describe('C errors', () => {
	it('reports syntax errors with a location', () => {
		const c = compileSpec('%%\n%%\nint main() { printf("x") return 0; }\n');
		const err = c.diagnostics.find((d) => d.severity === 'error')!;
		expect(err.message).toBe('expected ; after printf(…)');
		expect(c.spec.text.slice(0, err.span!.start)).toMatch(/printf\("x"\)$/);
	});

	it('reports undeclared names and unknown functions before running', () => {
		expect(compileErrors(main('x = 1;'))).toEqual(['x is undeclared']);
		expect(compileErrors(main('frobnicate(1);'))).toEqual(['frobnicate() is not defined']);
		expect(compileErrors('int f(int a) { return a; }\n' + main('f(1, 2);'))).toEqual([
			'f() takes 1 argument but got 2'
		]);
		expect(compileErrors(main('break;'))).toEqual(['break is not inside a loop or switch']);
		expect(compileErrors(main('int a; int a;'))).toEqual(['a is already declared here']);
	});

	it('requires constant initializers for static locals', () => {
		expect(compileErrors(main('int k = 2; static int n = k;'))).toEqual([
			'n is static, so its initializer must be a constant'
		]);
		expect(compileErrors(main('static int n = yyleng;'))).toEqual([
			'n is static, so its initializer must be a constant'
		]);
		expect(compileErrors(main('static int a[2] = { 1, atoi("2") };'))).toEqual([
			'a is static, so its initializer must be a constant'
		]);
		expect(
			compileErrors(
				'#define BASE 10\nenum { RED = 3 };\n' +
					main(
						'enum { LOCAL = 1 }; static int n = BASE * 2 + RED - LOCAL, m = sizeof(int), c = \'a\'; static char *s = "x";'
					)
			)
		).toEqual([]);
		expect(compileErrors(main('for (static int i = 0; i < 2; i++) { }'))).toEqual([
			'a for loop cannot declare a static variable'
		]);
	});

	it('checks global initializers when the spec is compiled', () => {
		const c = compileSpec('%{\nint a = UNDEFINED;\n%}\n%%\n%%\n');
		expect(c.ok).toBe(false);
		const d = c.diagnostics.find((x) => x.severity === 'error')!;
		expect(d.message).toBe('UNDEFINED is undeclared');
		expect(c.spec.text.slice(d.span!.start, d.span!.end)).toBe('UNDEFINED');
		// Globals are initialized in text order, so a later one is not visible yet.
		expect(compileErrors('int a = b;\nint b = 1;\n')).toEqual(['b is undeclared']);
		expect(compileErrors('int n = 3, a[n];\nenum { X, Y = X + 2 };\nint c[Y];\n')).toEqual([]);
		expect(compileErrors('int f(void) { return 1; }\nint x = f();\n')).toEqual([
			"a global's initializer cannot call f(): globals are set before main runs"
		]);
		expect(compileErrors('int t = yyterminate();\nint u = yyless(1);\n')).toEqual([
			"yyterminate() is flex's return 0, so it can only be used inside a function",
			'yyless() can only be used in a rule’s action'
		]);
		expect(
			compileErrors('int g = frobnicate(2);\nint h = main;\nint main() { return 0; }\n')
		).toEqual(['frobnicate() is not defined', 'main is a function; call it as main(…)']);
	});

	it('reports the type problems of global initializers with their spans', () => {
		const code = [
			'int a = "x";',
			'char *p = 5;',
			'char s[2] = "abc";',
			'int b[2] = { 1, 2, 3 };',
			'int n = { 1, 2 };',
			'int d[0];',
			'int z = 1 / 0;',
			'double m = 2.5 % 2;',
			'int len = strlen("ab") + "x";',
			'enum { E = "e" };',
			'extern int later;',
			'int early = later;',
			'int later = 1;'
		].join('\n');
		const text = `%%\n%%\n${code}\n`;
		const c = compileSpec(text);
		expect(c.ok).toBe(false);
		expect(
			c.diagnostics
				.filter((d) => d.severity === 'error')
				.map((d) => [d.message, text.slice(d.span!.start, d.span!.end)])
		).toEqual([
			['cannot use a pointer as int', '"x"'],
			['cannot use the number 5 as char *', '5'],
			['the string is too long for s[2]', 's[2] = "abc"'],
			['too many initializers for b[2]', '{ 1, 2, 3 }'],
			['n is not an array', '{ 1, 2 }'],
			['array d has a bad size (0)', 'd[0]'],
			['division by zero', '1 / 0'],
			['% needs integer operands', '2.5 % 2'],
			['cannot use a pointer as int', 'strlen("ab") + "x"'],
			['expected a number here', 'E'],
			['later is undeclared', 'later']
		]);
	});

	it('leaves global initializers it cannot evaluate to the run', () => {
		// k++ changes k, so arr's size is not evaluated here (it is 1 at run time).
		const code =
			'%x COMMENT\n%{\nint k = 0;\nint j = k++;\nint arr[k];\nint sc = COMMENT;\nchar buf[8];\nchar *end = buf + 7;\n%}\n%%\n%%\n' +
			'int main() { arr[0] = 5; printf("%d %d %d %d", k, j, arr[0], sc); return 0; }\n';
		const c = compileSpec(code);
		expect(c.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		expect(outputText(runScanner(c, ''))).toBe('1 0 5 1');
		expect(
			compileErrors('int start = yylineno;\nFILE *out = stdout;\nchar *none = NULL;\n')
		).toEqual([]);
	});

	it('leaves global arrays and malloc() memory past the check limit to the run', () => {
		const n = GLOBAL_CHECK_MEMORY;
		// Within the limit the array is evaluated, so an initializer that reads it is too.
		expect(compileErrors(`int a[${n}];\nint z = sizeof(a) / 0;\n`)).toEqual(['division by zero']);
		// The limit is a total: b does not fit after a, so b (and z, which reads it) is left
		// to the run, which reports the error.
		const code = `int a[${n / 2 + 1}];\nint b[${n / 2}];\nint z = sizeof(b) / 0;\nint main() { return 0; }\n`;
		expect(compileErrors(code)).toEqual([]);
		expect(runC(code).stopped).toMatch(/division by zero/);
		expect(
			compileErrors('#include <stdlib.h>\nchar *p = malloc(1000000);\nint z = (p != NULL) / 0;\n')
		).toEqual([]);
		// Globals after a skipped one are still checked, and sizes are checked before the limit.
		expect(
			compileErrors(
				'#include <stdlib.h>\nint big[1000000];\nchar *p = calloc(1000, 1000);\nchar s[2] = "abc";\n' +
					'int huge[1000001];\nchar *q = malloc(0);\nint d[0];\n'
			)
		).toEqual([
			'the string is too long for s[2]',
			'array huge has a bad size (1000001)',
			'malloc(0): bad size',
			'array d has a bad size (0)'
		]);
		expect(
			compileErrors(
				'#include <stdlib.h>\n' +
					Array.from(
						{ length: 40 },
						(_, k) => `int a${k}[1000000];\nchar *p${k} = malloc(1000000);\n`
					).join('')
			)
		).toEqual([]);
		// The run itself has no such limit.
		expect(
			out(
				'#include <stdlib.h>\nint big[1000000];\nchar *p = malloc(1000000);\n' +
					main('big[999999] = 7; p[999999] = 8; printf("%d %d", big[999999], p[999999]);')
			)
		).toBe('7 8');
	});

	it('stops a machine at its memory limit before allocating', () => {
		const noScanner: FlexHooks = {
			yylex: () => 0,
			input: () => -1,
			yyless: () => {},
			begin: () => {},
			echo: () => {},
			terminate: () => {
				throw new Error('yyterminate');
			},
			yyStart: () => 0
		};
		const globals = compileSpec(
			'%%\n%%\n#include <stdlib.h>\nint a[60];\nchar *p = malloc(30);\nchar *q = strdup("abcdefghi");\n' +
				'int b[1];\nint c[0];\nint d[2000000];\n'
		).globals;
		const [a, p, q, b, c, d] = globals;
		const machine = new CMachine({
			budget: 1000,
			outputLimit: 1000,
			memoryLimit: 100,
			hooks: noScanner
		});
		for (const s of [a, p, q]) machine.exec(s, machine.globals);
		expect(machine.allocated).toBe(100);
		const thrown = (s: (typeof globals)[number]) => {
			try {
				machine.exec(s, machine.globals);
			} catch (e) {
				return e;
			}
			return null;
		};
		const full = thrown(b);
		expect(full).toBeInstanceOf(CLimitError);
		expect((full as CLimitError).message).toBe(
			'stopped: the program needs more than 100 elements of memory'
		);
		expect(machine.allocated).toBe(100);
		// Bad sizes are reported as themselves, not as the limit.
		for (const s of [c, d]) {
			const e = thrown(s);
			expect(e).toBeInstanceOf(CRuntimeError);
			expect(e).not.toBeInstanceOf(CLimitError);
		}
		// Without a limit nothing is counted against one.
		const free = new CMachine({ budget: 1000, outputLimit: 1000, hooks: noScanner });
		for (const s of globals.slice(0, 4)) free.exec(s, free.globals);
		expect(free.globals.get('b')?.arr?.data.length).toBe(1);
	});

	it('reports unsupported features clearly', () => {
		expect(compileErrors('struct point { int x; };')).toEqual([
			'struct is not supported in this playground'
		]);
		expect(compileErrors('#define MAX(a, b) a\n')).toEqual([
			'#define MAX(…): macros with parameters are not supported; write a function instead'
		]);
	});

	it('reports curly quotes from the slides', () => {
		expect(compileErrors(main('printf (“%s\\n”, "x");'))).toEqual([
			'C needs straight quotes: “ is a curly quote'
		]);
		expect(hasCurlyQuotes('printf (“%s\\n”, yytext);')).toBe(true);
		expect(straightenQuotes('printf (“%s\\n”, ‘x’);')).toBe('printf ("%s\\n", \'x\');');
	});

	it('turns runtime problems into diagnostics', () => {
		const run = runC(main('int a[3]; a[5] = 1;'));
		expect(run.stopped).toMatch(/index 5 is outside a/);
		expect(run.diagnostics[0].span).toBeDefined();
		expect(runC(main('int z = 0; printf("%d", 1 / z);')).stopped).toMatch(/division by zero/);
		expect(runC(main('char *s = "lit"; s[0] = \'x\';')).stopped).toMatch(
			/cannot modify a string literal/
		);
		expect(runC(main('char b[3]; strcpy(b, "toolong");')).stopped).toMatch(/room for 3/);
	});

	it('stops endless loops with the step budget', () => {
		const run = runC(main('while (1) { }'), '', 10_000);
		expect(run.stopped).toMatch(/stopped after 10,000 steps/);
		expect(run.exitStatus).toBeNull();
	});

	it('stops endless recursion', () => {
		const run = runC('int f(int n) { return f(n + 1); }\nint main() { return f(0); }\n');
		expect(run.stopped).toMatch(/nested more than/);
	});
});
