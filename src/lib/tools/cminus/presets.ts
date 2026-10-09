/**
 * The programs the preset menu offers. All of them were written for this page
 * (the one-line program of the lecture deck is quoted from its slide). Their
 * identifiers are made of letters only, so they read the same under both
 * identifier rules.
 */
import type { Preset } from '$lib/components/ui/types';
import { UNDECLARED_SOURCE } from '$lib/theory/cminus';
import type { TabId } from './state';

export interface CminusPresetValue {
	/** C- program text. */
	source: string;
	/** The numbers the program reads, as typed in the Input field. */
	input: string;
	/** The tab to open with the program; absent: the tab stays. */
	tab?: TabId;
}

export type CminusPreset = Preset<CminusPresetValue>;

const GCD = `/* The greatest common divisor of two numbers.
   C- has no remainder operator:
   u - u / v * v is the remainder of u by v. */

int gcd(int u, int v)
{
  if (v == 0)
    return u;
  return gcd(v, u - u / v * v);
}

void main(void)
{
  int a;
  int b;
  a = input();
  b = input();
  output(gcd(a, b));
}
`;

const FACTORIAL_LOOP = `/* n! with a loop: the product of the numbers
   from n down to 2. */

void main(void)
{
  int n;
  int product;
  n = input();
  product = 1;
  while (n > 1) {
    product = product * n;
    n = n - 1;
  }
  output(product);
}
`;

const FACTORIAL_RECURSIVE = `/* n! by recursion: n! = n * (n - 1)!,
   and 0! = 1! = 1. */

int factorial(int n)
{
  if (n < 2)
    return 1;
  return n * factorial(n - 1);
}

void main(void)
{
  output(factorial(input()));
}
`;

const FIBONACCI = `/* The first n Fibonacci numbers, each from
   fib(k) = fib(k - 1) + fib(k - 2). */

int fib(int k)
{
  if (k < 2)
    return k;
  return fib(k - 1) + fib(k - 2);
}

void main(void)
{
  int n;
  int k;
  n = input();
  k = 0;
  while (k < n) {
    output(fib(k));
    k = k + 1;
  }
}
`;

const SORT = `/* Reads ten numbers into a global array,
   sorts them in ascending order and prints
   them. sort gets the array by reference:
   a[] names the caller's cells. */

int numbers[10];

void sort(int a[], int count)
{
  int last;
  int i;
  int held;
  last = count - 1;
  while (last > 0) {
    i = 0;
    while (i < last) {
      if (a[i] > a[i + 1]) {
        held = a[i];
        a[i] = a[i + 1];
        a[i + 1] = held;
      }
      i = i + 1;
    }
    last = last - 1;
  }
}

void main(void)
{
  int i;
  i = 0;
  while (i < 10) {
    numbers[i] = input();
    i = i + 1;
  }
  sort(numbers, 10);
  i = 0;
  while (i < 10) {
    output(numbers[i]);
    i = i + 1;
  }
}
`;

const BLOCKS = `/* Three variables named x: a global one,
   one of main, and one of the block inside
   main. A use refers to the nearest
   declaration around it. */

int x;

void store(int value)
{
  x = value;
}

void show(void)
{
  output(x);
}

void main(void)
{
  int x;
  store(1);
  x = 2;
  {
    int x;
    x = 3;
    output(x);
  }
  output(x);
  show();
}
`;

const SUM = `/* Adds the numbers of the input up to the
   first 0. The assignment n = input() is an
   expression: its value is compared with 0. */

void main(void)
{
  int n;
  int sum;
  sum = 0;
  while ((n = input()) != 0)
    sum = sum + n;
  output(sum);
}
`;

const MISSING_SEMICOLON = `/* The assignment to total is not followed
   by a semicolon. */

void main(void)
{
  int total;
  total = input()
  output(total + 1);
}
`;

const ILLEGAL_CHARACTER = `/* % is not a symbol of C-. */

void main(void)
{
  int n;
  n = input();
  output(n % 2);
}
`;

export const PRESETS: readonly CminusPreset[] = [
	{
		id: 'gcd',
		label: 'Greatest common divisor',
		group: 'Programs',
		description: 'A recursive function; the remainder is computed as u - u / v * v.',
		value: { source: GCD, input: '48 18' }
	},
	{
		id: 'factorial-loop',
		label: 'Factorial with a loop',
		group: 'Programs',
		description: 'A while loop multiplies the numbers from n down to 2.',
		value: { source: FACTORIAL_LOOP, input: '5' }
	},
	{
		id: 'factorial-recursive',
		label: 'Factorial by recursion',
		group: 'Programs',
		description: 'Every call gets its own activation record on the stack.',
		value: { source: FACTORIAL_RECURSIVE, input: '5' }
	},
	{
		id: 'fibonacci',
		label: 'Fibonacci numbers',
		group: 'Programs',
		description: 'Two recursive calls in one expression: the first result waits in a temporary.',
		value: { source: FIBONACCI, input: '10' }
	},
	{
		id: 'sort',
		label: 'Sort ten numbers',
		group: 'Programs',
		description: 'A global array, passed by reference to a function with an array parameter.',
		value: { source: SORT, input: '34 7 23 32 5 62 32 2 78 1' }
	},
	{
		id: 'blocks',
		label: 'Nested blocks',
		group: 'Programs',
		description: 'A block declares x again: three scopes hold a variable of that name.',
		value: { source: BLOCKS, input: '' }
	},
	{
		id: 'sum',
		label: 'Sum until 0',
		group: 'Programs',
		description: 'The while test uses the value of an assignment: (n = input()) != 0.',
		value: { source: SUM, input: '4 8 15 16 23 42 0' }
	},
	{
		id: 'undeclared',
		label: 'Two undeclared identifiers',
		group: 'From the slides',
		description: `${UNDECLARED_SOURCE} The grammar derives this string; y and z are not declared, so the semantic analyzer stops the compilation.`,
		cite: { deck: '10', slide: 2 },
		value: { source: UNDECLARED_SOURCE, input: '', tab: 'semantics' }
	},
	{
		id: 'missing-semicolon',
		label: 'A missing semicolon',
		group: 'Errors in the earlier phases',
		description: 'A syntax error: the parser stops the compilation.',
		value: { source: MISSING_SEMICOLON, input: '7', tab: 'syntax' }
	},
	{
		id: 'illegal-character',
		label: 'An illegal character',
		group: 'Errors in the earlier phases',
		description: 'A lexical error: the scanner reports % as an ERROR token.',
		value: { source: ILLEGAL_CHARACTER, input: '7', tab: 'tokens' }
	}
];

export const DEFAULT_PRESET = PRESETS[0];

export function presetById(id: string | null | undefined): CminusPreset | undefined {
	return PRESETS.find((p) => p.id === id);
}

/** The preset whose program the state holds, if any. */
export function presetFor(state: { source: string }): CminusPreset | null {
	return PRESETS.find((p) => p.value.source === state.source) ?? null;
}
