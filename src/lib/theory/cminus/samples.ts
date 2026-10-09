/**
 * C- programs written for this site: the engine's tests run every one of
 * them through the compiler and the interpreter, and a page can offer them
 * as starting points.
 */

export interface SampleProgram {
	id: string;
	/** What the program does. */
	title: string;
	source: string;
	/** Input lists to run it with. */
	inputs: readonly (readonly number[])[];
}

const GCD = `/* Greatest common divisor by Euclid's algorithm:
   gcd(a, b) = gcd(b, a mod b), and gcd(a, 0) = a.
   C- has no remainder operator, so it is computed. */

int remainder(int a, int b)
{
  return a - a / b * b;
}

int gcd(int a, int b)
{
  if (b == 0)
    return a;
  return gcd(b, remainder(a, b));
}

void main(void)
{
  int first;
  int second;
  first = input();
  second = input();
  output(gcd(first, second));
}
`;

const FACTORIAL = `/* n! computed twice: by recursion and by a loop. */

int byrecursion(int n)
{
  if (n < 2)
    return 1;
  return n * byrecursion(n - 1);
}

int byloop(int n)
{
  int product;
  product = 1;
  while (n > 1) {
    product = product * n;
    n = n - 1;
  }
  return product;
}

void main(void)
{
  int n;
  n = input();
  output(byrecursion(n));
  output(byloop(n));
}
`;

const FIBONACCI = `/* Prints the first n Fibonacci numbers with a loop,
   then the n-th one again with the recursive definition. */

int fib(int n)
{
  if (n < 2)
    return n;
  return fib(n - 1) + fib(n - 2);
}

void main(void)
{
  int n;
  int i;
  int current;
  int next;
  int sum;

  n = input();
  current = 0;
  next = 1;
  i = 0;
  while (i < n) {
    output(current);
    sum = current + next;
    current = next;
    next = sum;
    i = i + 1;
  }
  output(fib(n));
}
`;

const SORT = `/* Reads ten numbers into a global array, sorts them by
   selection sort, and prints them in ascending order.
   The array is passed to the functions by reference. */

int data[10];

/* Index of the smallest of a[from], ..., a[to - 1]. */
int smallest(int a[], int from, int to)
{
  int best;
  int i;
  best = from;
  i = from + 1;
  while (i < to) {
    if (a[i] < a[best])
      best = i;
    i = i + 1;
  }
  return best;
}

void sort(int a[], int n)
{
  int i;
  int k;
  int held;
  i = 0;
  while (i < n - 1) {
    k = smallest(a, i, n);
    held = a[k];
    a[k] = a[i];
    a[i] = held;
    i = i + 1;
  }
}

void main(void)
{
  int i;
  i = 0;
  while (i < 10) {
    data[i] = input();
    i = i + 1;
  }
  sort(data, 10);
  i = 0;
  while (i < 10) {
    output(data[i]);
    i = i + 1;
  }
}
`;

const SCOPES = `/* Nested blocks: an inner declaration hides the outer one
   of the same name until its block ends. */

int x;

void main(void)
{
  int y;
  x = input();
  y = 2;
  {
    int x;
    x = 10;
    {
      int y;
      y = 20;
      x = x + y;
      output(x);        /* inner x, inner y: 30 */
    }
    output(x + y);      /* inner x, main's y: 32 */
  }
  output(x + y);        /* global x, main's y */
}
`;

const LOCAL_ARRAY = `/* A local array: element i gets i * step, then the
   elements are added up. */

void main(void)
{
  int multiples[8];
  int step;
  int i;
  int total;

  step = input();
  i = 0;
  while (i < 8) {
    multiples[i] = i * step;
    i = i + 1;
  }
  total = 0;
  i = 0;
  while (i < 8) {
    total = total + multiples[i];
    i = i + 1;
  }
  output(total);
}
`;

const NESTED_CALLS = `/* Calls as arguments of calls: every argument is computed
   before the call it belongs to is made. */

int add(int a, int b)
{
  return a + b;
}

int twice(int n)
{
  return n + n;
}

int square(int n)
{
  return n * n;
}

void main(void)
{
  int x;
  int y;
  x = input();
  y = input();
  output(add(twice(x), square(y)));
}
`;

const ASSIGN_VALUE = `/* An assignment is an expression: its value is the value
   assigned. Here the loop reads a number and tests it in one
   condition; a 0 ends the input. */

void main(void)
{
  int x;
  int count;
  int sum;
  count = 0;
  sum = 0;
  while ((x = input()) != 0) {
    count = count + 1;
    sum = sum + x;
  }
  output(count);
  output(sum);
}
`;

const DEEP_RECURSION = `/* Counts down by recursion: every call adds an activation
   record to the stack until n reaches 0. */

int depth(int n)
{
  if (n == 0)
    return 0;
  return 1 + depth(n - 1);
}

void main(void)
{
  output(depth(input()));
}
`;

/** The one-line program of the lecture deck: y and z are not declared. */
export const UNDECLARED_SOURCE = 'void main (void) { int x; y = input (); output (z); }';

const ZERO_DIVIDE = `/* Division by zero stops the machine: what was printed
   before the division stays, nothing after it is printed. */

void main(void)
{
  int a;
  int b;
  a = input();
  b = input();
  output(a);
  output(a / b);
  output(b);
}
`;

const NEGATIVE_SUBSCRIPT = `/* A negative subscript halts the program. */

int table[4];

void main(void)
{
  int i;
  i = input();
  table[0] = 7;
  output(table[0]);
  output(table[i]);
  output(1);
}
`;

export const SAMPLES: readonly SampleProgram[] = [
	{
		id: 'gcd',
		title: 'Greatest common divisor, recursive',
		source: GCD,
		inputs: [
			[48, 18],
			[17, 5],
			[100, 0],
			[0, 9],
			[1071, 462]
		]
	},
	{
		id: 'factorial',
		title: 'Factorial, by recursion and by a loop',
		source: FACTORIAL,
		inputs: [[0], [1], [5], [10], [13]]
	},
	{
		id: 'fibonacci',
		title: 'Fibonacci numbers',
		source: FIBONACCI,
		inputs: [[0], [1], [7], [12]]
	},
	{
		id: 'sort',
		title: 'Selection sort of ten numbers in a global array',
		source: SORT,
		inputs: [
			[5, 3, 9, 1, 7, 2, 8, 6, 4, 0],
			[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
			[10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
			[3, -1, 3, 0, -7, 12, 12, 5, -1, 2],
			[2000000000, -2000000000, 0, 7, -7, 2147483647, -2147483647, 1, -1, 100]
		]
	},
	{
		id: 'scopes',
		title: 'Nested blocks with hidden variables',
		source: SCOPES,
		inputs: [[1], [40], [-5]]
	},
	{
		id: 'local-array',
		title: 'A local array filled in a loop and summed',
		source: LOCAL_ARRAY,
		inputs: [[1], [5], [-3], [0]]
	},
	{
		id: 'nested-calls',
		title: 'Calls as arguments of calls',
		source: NESTED_CALLS,
		inputs: [
			[3, 4],
			[0, 0],
			[-6, 11]
		]
	},
	{
		id: 'assignment-value',
		title: 'An assignment used as a value',
		source: ASSIGN_VALUE,
		inputs: [[3, 4, 5, 0], [0], [-2, 2, 9, 0, 6], [1, 2, 3]]
	},
	{
		id: 'deep-recursion',
		title: 'Recursion a hundred calls deep',
		source: DEEP_RECURSION,
		inputs: [[0], [1], [50], [100]]
	},
	{
		id: 'undeclared',
		title: 'Two identifiers that are not declared',
		source: UNDECLARED_SOURCE,
		inputs: [[]]
	},
	{
		id: 'zero-divide',
		title: 'Division by zero',
		source: ZERO_DIVIDE,
		inputs: [
			[12, 0],
			[12, 5],
			[-9, 2]
		]
	},
	{
		id: 'negative-subscript',
		title: 'A negative subscript',
		source: NEGATIVE_SUBSCRIPT,
		inputs: [[-1], [0], [3], [-100]]
	}
];

/** The sample with the given id. */
export function sampleById(id: string): SampleProgram | undefined {
	return SAMPLES.find((s) => s.id === id);
}
