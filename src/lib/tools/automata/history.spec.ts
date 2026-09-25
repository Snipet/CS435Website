import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History', () => {
	it('undoes and redoes', () => {
		const h = new History('a');
		expect(h.canUndo).toBe(false);
		h.push('b');
		h.push('c');
		expect(h.current).toBe('c');
		expect(h.undo()).toBe('b');
		expect(h.undo()).toBe('a');
		expect(h.undo()).toBeNull();
		expect(h.canRedo).toBe(true);
		expect(h.redo()).toBe('b');
		expect(h.current).toBe('b');
	});

	it('drops the redo branch on a new push', () => {
		const h = new History(1);
		h.push(2);
		h.undo();
		h.push(3);
		expect(h.canRedo).toBe(false);
		expect(h.undo()).toBe(1);
	});

	it('merges pushes with the same tag', () => {
		const h = new History('start');
		h.push('x1', { merge: 'nudge' });
		h.push('x2', { merge: 'nudge' });
		h.push('x3', { merge: 'nudge' });
		expect(h.undo()).toBe('start');
		h.redo();
		h.push('y', { merge: 'nudge' });
		// An undo or redo ends the run of merged pushes.
		expect(h.undo()).toBe('x3');
	});

	it('keeps at most `limit` steps', () => {
		const h = new History(0, 3);
		for (let i = 1; i <= 10; i++) h.push(i);
		expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual([9, 8, 7, null]);
	});

	it('resets', () => {
		const h = new History('a');
		h.push('b');
		h.reset('z');
		expect(h.current).toBe('z');
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});
});
