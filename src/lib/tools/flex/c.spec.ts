import { describe, expect, it } from 'vitest';
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
