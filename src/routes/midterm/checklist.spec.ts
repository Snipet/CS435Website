import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';
import {
	DEFAULT_VIEW,
	ID_SEPARATOR,
	completeLines,
	counts,
	groups,
	groupsOf,
	knownIds,
	lines,
	linesUnder,
	matches,
	shownLines,
	tally,
	tallyText,
	withCheck,
	type Line,
	type View
} from './checklist';
import { allTopics, sections, type Section, type Topic } from './topics';

/** The line with this id. */
function at(id: string): Line {
	const found = lines.find((l) => l.id === id);
	if (!found) throw new Error(`no line ${id}`);
	return found;
}

const ids = (list: readonly Line[]) => list.map((l) => l.id);
const set = (...list: string[]) => new Set(list);

const HIDE: View = { hideChecked: true, starredOnly: false };
const STARRED: View = { hideChecked: false, starredOnly: true };

/** A small list in the shape of the review list, for edits of it. */
const topic = (text: string, sub: Topic[] = [], stars: 0 | 1 | 2 = 0): Topic => ({
	text,
	stars,
	links: [],
	sub
});
const small: Section[] = [
	{ id: 'one', heads: [topic('A')], topics: [topic('B', [topic('C'), topic('D', [], 1)])] },
	{ id: 'two', heads: [topic('E', [], 2), topic('F')], topics: [] }
];

describe('lines', () => {
	it('are the lines of the list, in its order, each with its depth', () => {
		expect(lines.length).toBe(104);
		const topics = allTopics();
		expect(lines.map((l) => l.topic)).toEqual(topics.map((t) => t.topic));
		expect(lines.map((l) => l.depth)).toEqual(topics.map((t) => t.depth));
		expect(lines.map((l) => l.index)).toEqual(lines.map((_, i) => i));
	});

	it('have ids made of the texts from the group’s top-level line down', () => {
		expect(ids(lines.slice(0, 3))).toEqual([
			'What is compiler?',
			'Language Impl Methods',
			'Language Impl Methods › “Languages are not interpreted or compiled” (witness “cling”, the C++ interpreter)'
		]);
		expect(at('Parsing › Parsing Algorithms › Top-Down › Predictive RD').topic.stars).toBe(0);
		expect(at('Parsing › Parsing Algorithms › Predictive RD').topic.stars).toBe(2);
		expect(at('Parsing › Bottom-Up › LR(1) › Closure(Items)').depth).toBe(3);
		// A group of several top-level lines: each stands alone.
		expect(ids(groups.find((g) => g.section.id === 'structure')!.lines)).toEqual([
			'Analysis/Synthesis Model',
			'Front/Middle/Back end',
			'Role of IR',
			'Passes'
		]);
	});

	it('have ids of their own, with texts that do not hold the separator', () => {
		expect(new Set(ids(lines)).size).toBe(lines.length);
		for (const l of lines) expect(l.topic.text, l.id).not.toContain(ID_SEPARATOR.trim());
	});

	it('put the topics of a group under its one top-level line', () => {
		for (const g of groups) {
			if (g.heads.length === 1) {
				expect(g.heads[0].sub.length).toBe(g.topics.length);
				g.topics.forEach((t, i) => expect(g.heads[0].sub[i]).toBe(t));
			} else expect(g.topics).toEqual([]);
			expect(g.lines).toEqual(lines.filter((l) => g.lines.includes(l)));
		}
		expect(groups.map((g) => g.section)).toEqual(sections);
		expect(groups.flatMap((g) => g.lines)).toEqual(lines);
	});

	it('keep their ids when other lines of the list change', () => {
		const before = ids(groupsOf(small).flatMap((g) => g.lines));
		expect(before).toEqual(['A', 'A › B', 'A › B › C', 'A › B › D', 'E', 'F']);
		// A line is added, one is starred, a group is moved: the other ids stay.
		const edited: Section[] = [
			small[1],
			{
				...small[0],
				topics: [topic('B', [topic('C', [], 1), topic('X'), topic('D', [], 1)])]
			}
		];
		const after = ids(groupsOf(edited).flatMap((g) => g.lines));
		expect(after).toEqual(['E', 'F', 'A', 'A › B', 'A › B › C', 'A › B › X', 'A › B › D']);
		expect(after.filter((id) => before.includes(id)).sort()).toEqual([...before].sort());
	});

	it('are checked and unchecked one at a time, in a new set', () => {
		const checked = set('Passes');
		const more = withCheck(checked, 'History', true);
		expect([...more].sort()).toEqual(['History', 'Passes']);
		expect([...withCheck(more, 'Passes', false)]).toEqual(['History']);
		expect([...checked]).toEqual(['Passes']);
		expect(withCheck(checked, 'Passes', true)).toEqual(checked);
	});

	it('know the ids of the list and leave out the others', () => {
		const stored = ['Passes', 'Parsing › Syntax-directed Translation (SDT)', 'History › Fortran'];
		expect([...knownIds(stored)]).toEqual(['Passes', 'History › Fortran']);
		expect(knownIds([])).toEqual(new Set());
	});
});

describe('views', () => {
	const list = groupsOf(small);
	const all = list.flatMap((g) => g.lines);

	it('show every line by default', () => {
		const { shown, matched } = shownLines(new Set(), DEFAULT_VIEW, list);
		expect([...shown]).toEqual(expect.arrayContaining(ids(all)));
		expect(shown.size).toBe(all.length);
		expect(matched.size).toBe(all.length);
	});

	it('hide checked lines, keeping a checked line above an unchecked one as context', () => {
		const checked = set('A', 'A › B › C', 'E');
		const { shown, matched } = shownLines(checked, HIDE, list);
		expect([...shown].sort()).toEqual(['A', 'A › B', 'A › B › D', 'F']);
		expect(matched.has('A')).toBe(false);
		expect(matched.has('A › B')).toBe(true);
		// Once everything under it is checked as well, the line goes.
		const done = shownLines(set('A', 'A › B', 'A › B › C', 'A › B › D'), HIDE, list);
		expect([...done.shown]).toEqual(['E', 'F']);
	});

	it('show only starred lines, with the lines above them as context', () => {
		const { shown, matched } = shownLines(new Set(), STARRED, list);
		expect([...shown].sort()).toEqual(['A', 'A › B', 'A › B › D', 'E']);
		expect([...matched].sort()).toEqual(['A › B › D', 'E']);
	});

	it('combine both', () => {
		const view = { hideChecked: true, starredOnly: true };
		expect([...shownLines(set('E'), view, list).shown].sort()).toEqual(['A', 'A › B', 'A › B › D']);
		expect(shownLines(set('E', 'A › B › D'), view, list).shown.size).toBe(0);
	});

	it('count every line, or only the starred ones', () => {
		const d = at('Parsing › Parsing Algorithms › Predictive RD');
		const a = at('Parsing › Parsing Algorithms › Predictive RD › Associativity');
		expect(counts(d, DEFAULT_VIEW) && counts(a, DEFAULT_VIEW)).toBe(true);
		expect(counts(d, STARRED)).toBe(true);
		expect(counts(a, STARRED)).toBe(false);
		expect(matches(d, set(d.id), HIDE)).toBe(false);
		expect(matches(d, set(d.id), STARRED)).toBe(true);
	});

	it('of the review list keep every group’s starred lines and what is above them', () => {
		const { shown, matched } = shownLines(new Set(), STARRED);
		expect(matched.size).toBe(30);
		expect(shown.has('Parsing › Parsing Algorithms › Top-Down')).toBe(true);
		expect(matched.has('Parsing › Parsing Algorithms › Top-Down')).toBe(false);
		expect(shown.has('Parsing › Parsing Algorithms › Predictive RD › Associativity')).toBe(false);
		expect(shown.has('What is compiler?')).toBe(false);
	});
});

describe('complete lines', () => {
	const list = groupsOf(small);

	it('are checked, with every line under them checked', () => {
		expect([...completeLines(set('A › B › C', 'A › B › D', 'F'), list)].sort()).toEqual([
			'A › B › C',
			'A › B › D',
			'F'
		]);
		// Checking a line does not check the lines under it.
		expect(completeLines(set('A', 'A › B'), list).has('A')).toBe(false);
		expect(completeLines(set('A', 'A › B', 'A › B › C'), list).has('A › B')).toBe(false);
		const every = set('A', 'A › B', 'A › B › C', 'A › B › D');
		expect([...completeLines(every, list)]).toEqual(expect.arrayContaining([...every]));
	});

	it('include a group’s top-level line once all its topics are checked', () => {
		const history = groups.find((g) => g.section.id === 'history')!;
		const all = new Set(ids(history.lines));
		expect(completeLines(all).has('History')).toBe(true);
		all.delete('History › Fortran');
		expect(completeLines(all).has('History')).toBe(false);
	});
});

describe('tallies', () => {
	it('count the checked lines of a list under a view', () => {
		const checked = set('History', 'History › Fortran', 'Passes');
		expect(tally(lines, checked, DEFAULT_VIEW)).toEqual({ checked: 3, total: 104 });
		expect(tally(lines, checked, STARRED)).toEqual({ checked: 1, total: 30 });
		// Hiding checked lines does not change what is counted.
		expect(tally(lines, checked, HIDE)).toEqual({ checked: 3, total: 104 });
		const history = groups.find((g) => g.section.id === 'history')!;
		expect(tally(history.lines, checked, DEFAULT_VIEW)).toEqual({ checked: 2, total: 3 });
	});

	it('read as text', () => {
		expect(tallyText({ checked: 12, total: 104 }, DEFAULT_VIEW)).toBe('12 of 104 lines checked');
		expect(tallyText({ checked: 4, total: 30 }, STARRED)).toBe('4 of 30 starred lines checked');
		expect(tallyText({ checked: 0, total: 1 }, DEFAULT_VIEW)).toBe('0 of 1 line checked');
		expect(tallyText({ checked: 1, total: 1 }, STARRED)).toBe('1 of 1 starred line checked');
	});

	it('of the lines under a line go to any depth', () => {
		const lr = at('Parsing › Bottom-Up');
		expect(linesUnder(lr).map((l) => l.topic.text)).toEqual([
			'Reduce string to start symbol',
			'Produce rightmost derivation in reverse',
			'LR(1)',
			'LR(1) Items',
			'Closure(Items)',
			'Constructing DFA and table'
		]);
		expect(linesUnder(at('Passes'))).toEqual([]);
	});
});

describe('the page', () => {
	const { body } = render(Page);
	const text = (html: string) => html.replace(/<!--[^]*?-->/g, '').replace(/\s+/g, ' ');
	const page = text(body);
	const boxes = [
		...body.matchAll(
			/<label class="check[^"]*"><input type="checkbox"([^>]*)\/><span class="print-box[^"]*" aria-hidden="true">(.)<\/span><span class="text[^"]*">([^<]*)<\/span><\/label>/g
		)
	];

	it('gives every line a checkbox labeled with its text, unchecked before the stored checks are read', () => {
		expect(boxes.length).toBe(lines.length);
		const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
		expect(boxes.map((m) => m[3])).toEqual(lines.map((l) => escape(l.topic.text)));
		for (const [, attributes, box] of boxes) {
			expect(attributes).not.toMatch(/\bchecked\b/);
			expect(box).toBe('☐');
		}
	});

	it('describes a line with lines under it by how many of them are checked', () => {
		const described = boxes.filter((m) => m[1].includes('aria-describedby'));
		expect(described.length).toBe(lines.filter((l) => l.sub.length > 0).length);
		for (const l of lines.filter((l) => l.sub.length > 0)) {
			const n = linesUnder(l).length;
			expect(page).toContain(
				`id="under-${l.index}">0 of ${n} ${n === 1 ? 'line' : 'lines'} under it checked</span>`
			);
		}
	});

	it('shows the progress of the list and of each group, the view options and the clear button', () => {
		expect(page).toContain('0 of 104 lines checked');
		for (const g of groups) {
			expect(page).toContain(tallyText({ checked: 0, total: g.lines.length }, DEFAULT_VIEW));
		}
		expect(page).toContain('Hide checked lines');
		expect(page).toContain('Only starred lines');
		expect(page).toContain('Checks are saved in this browser only.');
		// Nothing to clear yet.
		expect(page).toMatch(
			/<button type="button" class="btn secondary sm[^"]*" disabled="">.*?Clear checks/
		);
		expect(page).not.toContain('Clear all');
	});

	it('reads the browser’s storage only once it is mounted', () => {
		const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
		const script = /<script lang="ts">([\s\S]*?)<\/script>/.exec(source)?.[1] ?? '';
		expect(script).not.toMatch(/\blocalStorage\b/);
		const [top] = script.split('onMount(');
		expect(top).not.toMatch(/browserStorage\(|readIds\(|readFlags\(/);
	});
});
