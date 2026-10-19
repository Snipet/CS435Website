/**
 * The review list as a checklist: an id for every line, which lines a view
 * shows, which are complete, and how many are checked.
 *
 * A line's id is the text of the line and of the lines above it, from its
 * group's top-level line down, joined by " › " ("Parsing › Parsing Algorithms
 * › Top-Down › Predictive RD"). Stars are not part of it. An edit of the list
 * keeps the id, and so the check, of every line whose text and place stay the
 * same; ids of lines that are gone are left out when checks are read.
 *
 * Each line is checked by itself: checking a line does not check the points
 * under it. A line is complete when it and every line under it are checked.
 */
import { sections, type Section, type Topic } from './topics';

/** Joins the texts of a line's path into its id. */
export const ID_SEPARATOR = ' › ';

/** One line of the list. */
export interface Line {
	/** Stable id, from the line's path (see above). */
	id: string;
	/** Position in the list, from 0, top to bottom. */
	index: number;
	topic: Topic;
	/** 0 for a group's top-level lines, 1 for the topics under them, and so on. */
	depth: number;
	/**
	 * The lines under it. Under a group's only top-level line: the group's
	 * topics (`Group.topics`, the same objects).
	 */
	sub: readonly Line[];
}

/** A group of the list as lines: its top-level lines and the topics under them. */
export interface Group {
	section: Section;
	heads: readonly Line[];
	topics: readonly Line[];
	/** Every line of the group, top to bottom. */
	lines: readonly Line[];
}

/** How the list is shown: on/off options, stored as they are (`$lib/checklist`). */
export type View = {
	/** Leave out checked lines (a line with unchecked lines under it stays, as context). */
	hideChecked: boolean;
	/** Show and count only starred lines (the lines above them stay, as context). */
	starredOnly: boolean;
};

export const DEFAULT_VIEW: View = { hideChecked: false, starredOnly: false };

/** A line being built: its points are added once they are built. */
type Building = Omit<Line, 'sub'> & { sub: Line[] };

/** The lines of each group of a list. */
export function groupsOf(list: readonly Section[]): Group[] {
	let index = 0;
	const all: Line[] = [];
	const build = (topic: Topic, path: readonly string[], depth: number): Building => {
		const own = [...path, topic.text];
		const line: Building = { id: own.join(ID_SEPARATOR), index: index++, topic, depth, sub: [] };
		all.push(line);
		for (const s of topic.sub) line.sub.push(build(s, own, depth + 1));
		return line;
	};
	return list.map((section) => {
		const first = all.length;
		const heads = section.heads.map((h) => build(h, [], 0));
		// The topics are the points of the group's one top-level line. (A group with
		// several has no topics; any there were would stand on their own.)
		const above = heads.length === 1 ? heads[0] : null;
		const topics = section.topics.map((t) => build(t, above ? [above.topic.text] : [], 1));
		above?.sub.push(...topics);
		return { section, heads, topics, lines: all.slice(first) };
	});
}

/** The groups of the review list. */
export const groups: readonly Group[] = groupsOf(sections);

/** Every line of the review list, top to bottom. */
export const lines: readonly Line[] = groups.flatMap((g) => g.lines);

/** The lines at the top of each group's tree: its top-level lines, and topics without one above them. */
const roots = (list: readonly Group[]): Line[] =>
	list.flatMap((g) => (g.heads.length === 1 ? g.heads : [...g.heads, ...g.topics]));

/** The ids that name a line of the list, in the list's order. Others are left out. */
export function knownIds(ids: Iterable<string>, list: readonly Line[] = lines): Set<string> {
	const given = new Set(ids);
	return new Set(list.filter((l) => given.has(l.id)).map((l) => l.id));
}

/** The checks with one line checked or not; the given set is left as it is. */
export function withCheck(checked: ReadonlySet<string>, id: string, on: boolean): Set<string> {
	const next = new Set(checked);
	if (on) next.add(id);
	else next.delete(id);
	return next;
}

/** Whether a view counts a line: every line, or the starred ones. */
export const counts = (line: Line, view: View): boolean =>
	!view.starredOnly || line.topic.stars > 0;

/** Whether a view shows a line for itself: counted, and not hidden for being checked. */
export const matches = (line: Line, checked: ReadonlySet<string>, view: View): boolean =>
	counts(line, view) && !(view.hideChecked && checked.has(line.id));

/** What a view shows: the lines it matches, and every line above one of them. */
export interface Shown {
	/** Ids of the lines shown. */
	shown: Set<string>;
	/** Ids of the lines shown for themselves; the others are context. */
	matched: Set<string>;
}

export function shownLines(
	checked: ReadonlySet<string>,
	view: View,
	list: readonly Group[] = groups
): Shown {
	const shown = new Set<string>();
	const matched = new Set<string>();
	const walk = (line: Line): boolean => {
		let any = matches(line, checked, view);
		if (any) matched.add(line.id);
		for (const s of line.sub) if (walk(s)) any = true;
		if (any) shown.add(line.id);
		return any;
	};
	for (const root of roots(list)) walk(root);
	return { shown, matched };
}

/** Ids of the complete lines: checked, with every line under them checked. */
export function completeLines(
	checked: ReadonlySet<string>,
	list: readonly Group[] = groups
): Set<string> {
	const complete = new Set<string>();
	const walk = (line: Line): boolean => {
		let all = checked.has(line.id);
		for (const s of line.sub) if (!walk(s)) all = false;
		if (all) complete.add(line.id);
		return all;
	};
	for (const root of roots(list)) walk(root);
	return complete;
}

/** Lines checked out of the lines a view counts. */
export interface Tally {
	checked: number;
	total: number;
}

export function tally(list: readonly Line[], checked: ReadonlySet<string>, view: View): Tally {
	const counted = list.filter((l) => counts(l, view));
	return { checked: counted.filter((l) => checked.has(l.id)).length, total: counted.length };
}

/** Every line under a line, at any depth. */
export function linesUnder(line: Line): Line[] {
	return line.sub.flatMap((s) => [s, ...linesUnder(s)]);
}

/** "12 of 104 lines checked", "4 of 30 starred lines checked". */
export function tallyText(t: Tally, view: View): string {
	const what = view.starredOnly ? 'starred lines' : 'lines';
	return `${t.checked} of ${t.total} ${t.total === 1 ? what.slice(0, -1) : what} checked`;
}
