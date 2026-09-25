import type { ToolMeta } from '../types';

export const tool: ToolMeta = {
	slug: 'flex',
	title: 'Flex Playground',
	summary:
		'Run a flex specification on sample input in the browser and step through each match yylex() makes.',
	stage: 'lexical',
	order: 80,
	cites: [{ deck: '07', slide: [2, 11] }],
	keywords: [
		'flex',
		'lex',
		'scanner generator',
		'yylex',
		'yytext',
		'yyleng',
		'ECHO',
		'longest match',
		'start condition',
		'word count',
		'lex.yy.c'
	]
};
