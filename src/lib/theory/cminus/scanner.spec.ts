import { describe, expect, it } from 'vitest';
import { scan } from './scanner';
import { KEYWORDS, SYMBOLS, TOKEN_TYPES, joinSpans, spellingOf, type TokenType } from './tokens';

/** "TYPE lexeme" for every token but ENDFILE. */
const pairs = (source: string, identifiers?: 'letters' | 'extended') =>
	scan(source, { identifiers })
		.tokens.filter((t) => t.type !== 'ENDFILE')
		.map((t) => `${t.type} ${t.lexeme}`);
const types = (source: string, identifiers?: 'letters' | 'extended') =>
	scan(source, { identifiers }).tokens.map((t) => t.type);

describe('token types', () => {
	it('scans every keyword', () => {
		expect(pairs('else if int return void while')).toEqual([
			'ELSE else',
			'IF if',
			'INT int',
			'RETURN return',
			'VOID void',
			'WHILE while'
		]);
	});

	it('scans every special symbol', () => {
		expect(pairs('+ - * / < <= > >= == != = ; , ( ) [ ] { }')).toEqual([
			'PLUS +',
			'MINUS -',
			'TIMES *',
			'OVER /',
			'LT <',
			'LTE <=',
			'GT >',
			'GTE >=',
			'EQ ==',
			'NEQ !=',
			'ASSIGN =',
			'SEMI ;',
			'COMMA ,',
			'LPAREN (',
			'RPAREN )',
			'LBRACKET [',
			'RBRACKET ]',
			'LBRACE {',
			'RBRACE }'
		]);
	});

	it('scans ID and NUM, with the value of a NUM', () => {
		const { tokens, diagnostics } = scan('count 42 007');
		expect(tokens.map((t) => [t.type, t.lexeme, t.value])).toEqual([
			['ID', 'count', undefined],
			['NUM', '42', 42],
			['NUM', '007', 7],
			['ENDFILE', '', undefined]
		]);
		expect(diagnostics).toEqual([]);
	});

	it('ends every token list with ENDFILE, also for empty text', () => {
		expect(types('')).toEqual(['ENDFILE']);
		expect(types('   \n ')).toEqual(['ENDFILE']);
		expect(scan('x').tokens.at(-1)).toMatchObject({ type: 'ENDFILE', lexeme: '' });
	});

	it('produces every token type the language has', () => {
		const all = 'else if int return void while x 1 + - * / < <= > >= == != = ; , ( ) [ ] { } @';
		const seen = new Set<TokenType>(types(all));
		expect(TOKEN_TYPES.filter((t) => !seen.has(t))).toEqual([]);
		expect(TOKEN_TYPES).toHaveLength(6 + 2 + 19 + 2);
	});

	it('reserved words win over ID, and case matters', () => {
		expect(pairs('if If IF iff i')).toEqual(['IF if', 'ID If', 'ID IF', 'ID iff', 'ID i']);
		expect(pairs('integer voided whiles')).toEqual(['ID integer', 'ID voided', 'ID whiles']);
	});

	it('does not take an inherited property name for a keyword', () => {
		expect(pairs('constructor toString')).toEqual(['ID constructor', 'ID toString']);
	});
});

describe('maximal munch', () => {
	it('<= is one token and < = is two', () => {
		expect(pairs('a<=b')).toEqual(['ID a', 'LTE <=', 'ID b']);
		expect(pairs('a< =b')).toEqual(['ID a', 'LT <', 'ASSIGN =', 'ID b']);
	});

	it('== is one token and = = is two', () => {
		expect(pairs('a==b')).toEqual(['ID a', 'EQ ==', 'ID b']);
		expect(pairs('a= =b')).toEqual(['ID a', 'ASSIGN =', 'ASSIGN =', 'ID b']);
		expect(pairs('a===b')).toEqual(['ID a', 'EQ ==', 'ASSIGN =', 'ID b']);
	});

	it('>= and >', () => {
		expect(pairs('>=>')).toEqual(['GTE >=', 'GT >']);
		expect(pairs('>>=')).toEqual(['GT >', 'GTE >=']);
	});

	it('!= is a token; ! alone is an error', () => {
		expect(pairs('a!=b')).toEqual(['ID a', 'NEQ !=', 'ID b']);
		const r = scan('a ! b');
		expect(r.tokens.map((t) => t.type)).toEqual(['ID', 'ERROR', 'ID', 'ENDFILE']);
		expect(r.diagnostics).toHaveLength(1);
		expect(r.diagnostics[0]).toMatchObject({
			severity: 'error',
			message: '! alone is not a token: it is only used in !=.',
			span: { start: 2, end: 3, line: 1, column: 3 }
		});
		expect(pairs('! =')).toEqual(['ERROR !', 'ASSIGN =']);
	});

	it('tokens need no white space between them', () => {
		expect(pairs('x=y+12*(z-3);')).toEqual([
			'ID x',
			'ASSIGN =',
			'ID y',
			'PLUS +',
			'NUM 12',
			'TIMES *',
			'LPAREN (',
			'ID z',
			'MINUS -',
			'NUM 3',
			'RPAREN )',
			'SEMI ;'
		]);
	});
});

describe('identifiers', () => {
	it('letters only: x1 is ID x then NUM 1', () => {
		expect(pairs('x1')).toEqual(['ID x', 'NUM 1']);
		expect(pairs('a1b2')).toEqual(['ID a', 'NUM 1', 'ID b', 'NUM 2']);
		expect(pairs('12ab')).toEqual(['NUM 12', 'ID ab']);
	});

	it('letters only: an underscore is illegal', () => {
		const r = scan('my_var');
		expect(r.tokens.map((t) => `${t.type} ${t.lexeme}`)).toEqual([
			'ID my',
			'ERROR _',
			'ID var',
			'ENDFILE '
		]);
		expect(r.diagnostics[0].message).toBe(
			'Illegal character "_": an identifier is made of letters only.'
		);
	});

	it('extended: x1 and my_var2 are one ID each', () => {
		expect(pairs('x1', 'extended')).toEqual(['ID x1']);
		expect(pairs('my_var2 = t1;', 'extended')).toEqual([
			'ID my_var2',
			'ASSIGN =',
			'ID t1',
			'SEMI ;'
		]);
	});

	it('extended: an identifier still starts with a letter', () => {
		expect(pairs('1x', 'extended')).toEqual(['NUM 1', 'ID x']);
		const r = scan('_x', { identifiers: 'extended' });
		expect(r.tokens.map((t) => t.type)).toEqual(['ERROR', 'ID', 'ENDFILE']);
		expect(r.diagnostics).toHaveLength(1);
	});

	it('extended: a keyword followed by a digit is an identifier', () => {
		expect(pairs('int1 if_', 'extended')).toEqual(['ID int1', 'ID if_']);
		expect(pairs('int1')).toEqual(['INT int', 'NUM 1']);
	});
});

describe('comments and white space', () => {
	it('a comment produces no token and is kept as trivia', () => {
		const r = scan('x /* note */ y');
		expect(r.tokens.map((t) => t.lexeme)).toEqual(['x', 'y', '']);
		expect(r.trivia.map((t) => [t.kind, t.text])).toEqual([
			['whitespace', ' '],
			['comment', '/* note */'],
			['whitespace', ' ']
		]);
		expect(r.diagnostics).toEqual([]);
	});

	it('a comment may stand where white space may, also between two tokens that touch', () => {
		expect(pairs('a/**/b')).toEqual(['ID a', 'ID b']);
		expect(pairs('x=/* y */1;')).toEqual(['ID x', 'ASSIGN =', 'NUM 1', 'SEMI ;']);
	});

	it('a comment may span lines, and the lines are counted', () => {
		const r = scan('a /* one\n two\n three */ b\nc');
		expect(r.tokens.map((t) => [t.lexeme, t.span.line, t.span.column])).toEqual([
			['a', 1, 1],
			['b', 3, 11],
			['c', 4, 1],
			['', 4, 2]
		]);
	});

	it('comments do not nest: the first */ closes', () => {
		const r = scan('/* a /* b */ c */');
		expect(r.trivia[0].text).toBe('/* a /* b */');
		expect(r.tokens.map((t) => `${t.type} ${t.lexeme}`)).toEqual([
			'ID c',
			'TIMES *',
			'OVER /',
			'ENDFILE '
		]);
		expect(r.diagnostics).toEqual([]);
	});

	it('/*/ does not close itself', () => {
		const r = scan('/*/ x */ y');
		expect(r.trivia[0].text).toBe('/*/ x */');
		expect(r.tokens.map((t) => t.lexeme)).toEqual(['y', '']);
	});

	it('an unterminated comment is one ERROR token to the end of the text', () => {
		const r = scan('x = 1; /* never\nclosed');
		expect(r.tokens.map((t) => t.type)).toEqual([
			'ID',
			'ASSIGN',
			'NUM',
			'SEMI',
			'ERROR',
			'ENDFILE'
		]);
		expect(r.tokens[4].lexeme).toBe('/* never\nclosed');
		expect(r.diagnostics).toEqual([
			{
				severity: 'error',
				message: 'This comment is never closed: there is no */ after it.',
				span: { start: 7, end: 9, line: 1, column: 8, source: null }
			}
		]);
		// ENDFILE is on the last line.
		expect(r.tokens[5].span).toMatchObject({ start: 22, end: 22, line: 2, column: 7 });
	});

	it('a slash or a star alone is an operator', () => {
		expect(pairs('a / b * c')).toEqual(['ID a', 'OVER /', 'ID b', 'TIMES *', 'ID c']);
		expect(pairs('a */ b')).toEqual(['ID a', 'TIMES *', 'OVER /', 'ID b']);
	});

	it('blanks, tabs and line breaks separate tokens', () => {
		expect(pairs('int\tx\n;\r\nvoid  y')).toEqual([
			'INT int',
			'ID x',
			'SEMI ;',
			'VOID void',
			'ID y'
		]);
		expect(pairs('in t')).toEqual(['ID in', 'ID t']);
	});

	it('tokens and trivia together cover the whole text', () => {
		const source = 'int x; /* c */\n\tvoid main(void) { x = 3 ; }\n';
		const r = scan(source);
		const pieces = [...r.tokens, ...r.trivia].sort((a, b) => a.span.start - b.span.start);
		let at = 0;
		for (const p of pieces) {
			expect(p.span.start).toBe(at);
			at = p.span.end;
		}
		expect(at).toBe(source.length);
	});
});

describe('errors', () => {
	it('an illegal character is an ERROR token and scanning continues', () => {
		const r = scan('x = 3 @ 4 # y;');
		expect(r.tokens.map((t) => `${t.type} ${t.lexeme}`)).toEqual([
			'ID x',
			'ASSIGN =',
			'NUM 3',
			'ERROR @',
			'NUM 4',
			'ERROR #',
			'ID y',
			'SEMI ;',
			'ENDFILE '
		]);
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			'Illegal character "@": no token starts with it.',
			'Illegal character "#": no token starts with it.'
		]);
		expect(r.diagnostics.map((d) => d.span)).toEqual([
			{ start: 6, end: 7, line: 1, column: 7, source: null },
			{ start: 10, end: 11, line: 1, column: 11, source: null }
		]);
	});

	it('every illegal character is its own token', () => {
		const r = scan('$$');
		expect(r.tokens.map((t) => t.type)).toEqual(['ERROR', 'ERROR', 'ENDFILE']);
		expect(r.diagnostics).toHaveLength(2);
	});

	it('a character outside the basic plane is one token', () => {
		const r = scan('a 😀 b');
		expect(r.tokens.map((t) => t.lexeme)).toEqual(['a', '😀', 'b', '']);
		expect(r.tokens[1].span).toMatchObject({ start: 2, end: 4 });
		expect(r.diagnostics).toHaveLength(1);
	});

	it('letters of other alphabets and other punctuation are illegal', () => {
		expect(types('é')).toEqual(['ERROR', 'ENDFILE']);
		expect(types('a.b')).toEqual(['ID', 'ERROR', 'ID', 'ENDFILE']);
		expect(types('"s"')).toEqual(['ERROR', 'ID', 'ERROR', 'ENDFILE']);
		expect(types('a % b & c')).toEqual(['ID', 'ERROR', 'ID', 'ERROR', 'ID', 'ENDFILE']);
	});

	it('a control character is shown escaped in the message', () => {
		expect(scan('\u0001').diagnostics[0].message).toBe(
			'Illegal character "\\x01": no token starts with it.'
		);
	});
});

describe('spans', () => {
	it('start, end, line and column of every token', () => {
		const r = scan('int x;\n  x = 10;\n');
		expect(
			r.tokens.map((t) => [t.lexeme, t.span.start, t.span.end, t.span.line, t.span.column])
		).toEqual([
			['int', 0, 3, 1, 1],
			['x', 4, 5, 1, 5],
			[';', 5, 6, 1, 6],
			['x', 9, 10, 2, 3],
			['=', 11, 12, 2, 5],
			['10', 13, 15, 2, 7],
			[';', 15, 16, 2, 9],
			['', 17, 17, 3, 1]
		]);
		for (const t of r.tokens) expect(t.span.source).toBeNull();
	});

	it('the lexeme is the text of the span', () => {
		const source = 'while (i <= 10) { i = i + 1; } /* done */';
		for (const t of scan(source).tokens) {
			expect(source.slice(t.span.start, t.span.end)).toBe(t.lexeme);
		}
	});

	it('Windows line endings count one line each', () => {
		const r = scan('a\r\nb\r\nc');
		expect(r.tokens.map((t) => [t.lexeme, t.span.line, t.span.column])).toEqual([
			['a', 1, 1],
			['b', 2, 1],
			['c', 3, 1],
			['', 3, 2]
		]);
	});

	it('white-space trivia records where it starts', () => {
		const r = scan('a\n\n  b');
		expect(r.trivia).toEqual([
			{
				kind: 'whitespace',
				text: '\n\n  ',
				span: { start: 1, end: 5, line: 1, column: 2, source: null }
			}
		]);
		expect(r.tokens[1].span).toMatchObject({ line: 3, column: 3 });
	});
});

describe('token tables', () => {
	it('spellingOf gives the fixed spellings', () => {
		expect(spellingOf('WHILE')).toBe('while');
		expect(spellingOf('NEQ')).toBe('!=');
		expect(spellingOf('LBRACE')).toBe('{');
		expect(spellingOf('ID')).toBeNull();
		expect(spellingOf('NUM')).toBeNull();
		expect(spellingOf('ENDFILE')).toBeNull();
		expect(spellingOf('ERROR')).toBeNull();
	});

	it('lists 6 keywords and 19 special symbols', () => {
		expect(Object.keys(KEYWORDS)).toEqual(['else', 'if', 'int', 'return', 'void', 'while']);
		expect(SYMBOLS).toHaveLength(19);
		// A symbol that starts another one is listed after it.
		SYMBOLS.forEach(([text], i) => {
			for (const [longer] of SYMBOLS.slice(i + 1)) expect(longer.startsWith(text)).toBe(false);
		});
	});

	it('joinSpans runs from the start of the first to the end of the second', () => {
		const [a, , c] = scan('ab + cd').tokens;
		expect(joinSpans(a.span, c.span)).toEqual({
			start: 0,
			end: 7,
			line: 1,
			column: 1,
			source: null
		});
	});
});
