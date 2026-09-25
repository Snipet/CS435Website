import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	answer,
	READY,
	serveTask,
	type TaskRequest,
	type TaskScope,
	type TaskWorker
} from './worker-protocol';
import { WorkerTask } from './worker-task.svelte';

const square = (n: number) => n * n;

/** A worker that answers only when the test says so. */
class FakeWorker implements TaskWorker {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	posted: TaskRequest<number>[] = [];
	terminated = false;

	constructor(readonly compute: (n: number) => number = square) {}

	postMessage(message: unknown) {
		this.posted.push(message as TaskRequest<number>);
	}
	terminate() {
		this.terminated = true;
	}
	ready() {
		this.onmessage?.({ data: READY } as MessageEvent);
	}
	/** Answers the `i`-th request posted (default: the last). */
	respond(i = this.posted.length - 1) {
		const req = this.posted[i];
		this.onmessage?.({ data: answer(req.id, () => this.compute(req.input)) } as MessageEvent);
	}
	crash(message = 'boom') {
		this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
	}
}

function setup(options: { timeLimit?: number; restartAfter?: number; initial?: number } = {}) {
	const workers: FakeWorker[] = [];
	const results: [number, number][] = [];
	const task = new WorkerTask<number, number>({
		compute: square,
		worker: () => {
			const w = new FakeWorker();
			workers.push(w);
			return w;
		},
		onresult: (output, input) => results.push([input, output]),
		...options
	});
	return { task, workers, results, last: () => workers[workers.length - 1] };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('WorkerTask without a worker', () => {
	it('computes on the main thread at once', () => {
		const seen: number[] = [];
		const task = new WorkerTask<number, number>({ compute: square, onresult: (o) => seen.push(o) });
		expect(task.synchronous).toBe(true);
		expect(task.output).toBeNull();
		task.run(3);
		expect(task.output).toBe(9);
		expect(task.input).toBe(3);
		expect(task.status).toBe('idle');
		expect(seen).toEqual([9]);
		task.dispose();
	});

	it('computes the initial input in the constructor, and skips a request for it', () => {
		const compute = vi.fn(square);
		const task = new WorkerTask<number, number>({ compute, initial: 4 });
		expect(task.output).toBe(16);
		task.run(4);
		expect(compute).toHaveBeenCalledTimes(1);
		task.dispose();
	});

	it('reports an exception as an error and keeps the last output', () => {
		const task = new WorkerTask<number, number>({
			compute: (n) => {
				if (n < 0) throw new Error('negative');
				return n;
			},
			initial: 2
		});
		task.run(-1);
		expect(task.status).toBe('error');
		expect(task.error).toBe('negative');
		expect(task.output).toBe(2);
		task.run(5);
		expect(task.status).toBe('idle');
		expect(task.error).toBeNull();
		task.dispose();
	});

	it('falls back to the main thread when the worker cannot be created', () => {
		const task = new WorkerTask<number, number>({
			compute: square,
			worker: () => {
				throw new ReferenceError('Worker is not defined');
			}
		});
		task.run(5);
		expect(task.output).toBe(25);
		expect(task.synchronous).toBe(true);
		task.dispose();
	});
});

describe('WorkerTask with a worker', () => {
	it('creates the worker on the first request and delivers its answer', () => {
		const { task, workers, results, last } = setup({ initial: 1 });
		expect(workers).toHaveLength(0);
		expect(task.output).toBe(1);
		task.run(3);
		expect(workers).toHaveLength(1);
		expect(task.status).toBe('working');
		expect(task.output).toBe(1);
		last().ready();
		last().respond();
		expect(task.status).toBe('idle');
		expect(task.output).toBe(9);
		expect(task.input).toBe(3);
		expect(results).toEqual([
			[1, 1],
			[3, 9]
		]);
		task.dispose();
		expect(last().terminated).toBe(true);
	});

	it('runs one request at a time and only the latest waiting one', () => {
		const { task, last } = setup();
		task.run(1);
		const w = last();
		w.ready();
		task.run(2);
		task.run(3);
		expect(w.posted.map((r) => r.input)).toEqual([1]);
		// The answer to 1 is stale: dropped, and 3 (not 2) is posted.
		w.respond(0);
		expect(task.output).toBeNull();
		expect(task.status).toBe('working');
		expect(w.posted.map((r) => r.input)).toEqual([1, 3]);
		w.respond(1);
		expect(task.output).toBe(9);
		expect(task.status).toBe('idle');
	});

	it('does not post a request equal to the last one', () => {
		const { task, last } = setup();
		task.run(2);
		task.run(2);
		expect(last().posted).toHaveLength(1);
	});

	it('is idle again at once when the input goes back to the one shown', () => {
		const { task, last } = setup({ initial: 2 });
		task.run(5);
		const w = last();
		w.ready();
		task.run(6);
		task.run(2);
		expect(task.status).toBe('idle');
		expect(task.output).toBe(4);
		// Neither 5's answer nor a waiting 6 changes anything.
		w.respond(0);
		expect(w.posted).toHaveLength(1);
		expect(task.output).toBe(4);
		expect(task.status).toBe('idle');
	});

	it('times out: terminates the worker, reports it, and starts a new worker next time', () => {
		const { task, workers, last } = setup({ timeLimit: 1000 });
		task.run(7);
		const w = last();
		w.ready();
		vi.advanceTimersByTime(999);
		expect(task.status).toBe('working');
		vi.advanceTimersByTime(1);
		expect(w.terminated).toBe(true);
		expect(task.status).toBe('timed-out');
		expect(task.output).toBeNull();
		// A late answer from the terminated worker is ignored.
		w.respond();
		expect(task.output).toBeNull();
		task.run(8);
		expect(workers).toHaveLength(2);
		last().ready();
		last().respond();
		expect(task.output).toBe(64);
		expect(task.status).toBe('idle');
	});

	it('starts the clock only once the worker has loaded', () => {
		const { task, last } = setup({ timeLimit: 1000 });
		task.run(7);
		vi.advanceTimersByTime(5000);
		expect(task.status).toBe('working');
		last().ready();
		vi.advanceTimersByTime(1000);
		expect(task.status).toBe('timed-out');
	});

	it('a stale request that times out gives way to the waiting one', () => {
		const { task, workers, last } = setup({ timeLimit: 1000, restartAfter: 5000 });
		task.run(1);
		last().ready();
		task.run(2);
		vi.advanceTimersByTime(1000);
		expect(workers).toHaveLength(2);
		expect(task.status).toBe('working');
		expect(last().posted.map((r) => r.input)).toEqual([2]);
		last().ready();
		last().respond();
		expect(task.output).toBe(4);
	});

	it('abandons a long request for a newer one at once', () => {
		const { task, workers, last } = setup({ restartAfter: 300 });
		task.run(1);
		const first = last();
		first.ready();
		vi.advanceTimersByTime(350);
		task.run(2);
		expect(first.terminated).toBe(true);
		expect(workers).toHaveLength(2);
		expect(last().posted.map((r) => r.input)).toEqual([2]);
		last().ready();
		last().respond();
		expect(task.output).toBe(4);
		expect(task.status).toBe('idle');
	});

	it('drops the waiting request when it restarts for a newer one', () => {
		const { task, workers, last } = setup({ restartAfter: 300 });
		task.run(1);
		const first = last();
		first.ready();
		vi.advanceTimersByTime(100);
		task.run(2);
		vi.advanceTimersByTime(100);
		task.run(3);
		// 1 has run 200 ms: 3 replaces 2 as the waiting request.
		expect(workers).toHaveLength(1);
		vi.advanceTimersByTime(100);
		expect(first.terminated).toBe(true);
		expect(workers).toHaveLength(2);
		const second = last();
		second.ready();
		second.respond();
		expect(task.output).toBe(9);
		expect(task.status).toBe('idle');
		// Neither 1 nor 2 is sent to the new worker, before or after 3.
		expect(second.posted.map((r) => r.input)).toEqual([3]);
		// The next request is posted at once to the idle worker.
		task.run(4);
		expect(second.posted.map((r) => r.input)).toEqual([3, 4]);
	});

	it('drops the waiting request when a newer one restarts the worker at once', () => {
		const { task, workers, last } = setup({ restartAfter: 300 });
		task.run(1);
		last().ready();
		vi.advanceTimersByTime(100);
		task.run(2);
		// The clock moves without firing timers: 3 arrives as 1 reaches 300 ms.
		vi.setSystemTime(Date.now() + 200);
		task.run(3);
		expect(workers).toHaveLength(2);
		const second = last();
		second.ready();
		second.respond();
		expect(task.output).toBe(9);
		expect(second.posted.map((r) => r.input)).toEqual([3]);
		vi.advanceTimersByTime(1000);
		expect(workers).toHaveLength(2);
		expect(second.posted.map((r) => r.input)).toEqual([3]);
	});

	it('restarts for the waiting request once the older one has run restartAfter ms', () => {
		const { task, workers, last } = setup({ restartAfter: 300, timeLimit: 5000 });
		task.run(1);
		const first = last();
		first.ready();
		vi.advanceTimersByTime(100);
		task.run(2);
		// No more requests: 2 still gets the worker 300 ms after 1 started, not after the time limit.
		vi.advanceTimersByTime(199);
		expect(workers).toHaveLength(1);
		expect(task.status).toBe('working');
		vi.advanceTimersByTime(1);
		expect(first.terminated).toBe(true);
		expect(workers).toHaveLength(2);
		expect(task.status).toBe('working');
		const second = last();
		expect(second.posted.map((r) => r.input)).toEqual([2]);
		second.ready();
		second.respond();
		expect(task.output).toBe(4);
		expect(task.status).toBe('idle');
		// The restart did not report a time-out, and the old time limit is gone.
		vi.advanceTimersByTime(10_000);
		expect(task.status).toBe('idle');
		expect(workers).toHaveLength(2);
	});

	it('counts restartAfter from when the worker has loaded', () => {
		const { task, workers, last } = setup({ restartAfter: 300 });
		task.run(1);
		task.run(2);
		vi.advanceTimersByTime(1000);
		// 1 has not started: nothing to abandon yet.
		expect(workers).toHaveLength(1);
		last().ready();
		vi.advanceTimersByTime(299);
		expect(workers).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(workers).toHaveLength(2);
		expect(last().posted.map((r) => r.input)).toEqual([2]);
	});

	it('keeps the worker when the older request finishes before restartAfter', () => {
		const { task, workers, last } = setup({ restartAfter: 300 });
		task.run(1);
		const w = last();
		w.ready();
		vi.advanceTimersByTime(100);
		task.run(2);
		vi.advanceTimersByTime(100);
		w.respond(0);
		expect(w.posted.map((r) => r.input)).toEqual([1, 2]);
		vi.advanceTimersByTime(1000);
		expect(workers).toHaveLength(1);
		expect(w.terminated).toBe(false);
		w.respond(1);
		expect(task.output).toBe(4);
	});

	it('does not restart when the input goes back to the one shown', () => {
		const { task, workers, last } = setup({ restartAfter: 300, initial: 2 });
		task.run(5);
		last().ready();
		vi.advanceTimersByTime(100);
		task.run(6);
		task.run(2);
		vi.advanceTimersByTime(1000);
		expect(workers).toHaveLength(1);
		expect(task.status).toBe('idle');
		expect(task.output).toBe(4);
	});

	it('reports an error answer', () => {
		const workers: FakeWorker[] = [];
		const task = new WorkerTask<number, number>({
			compute: square,
			worker: () => {
				const w = new FakeWorker(() => {
					throw new Error('bad input');
				});
				workers.push(w);
				return w;
			}
		});
		task.run(1);
		workers[0].ready();
		workers[0].respond();
		expect(task.status).toBe('error');
		expect(task.error).toBe('bad input');
	});

	it('falls back to the main thread when the worker fails to load', () => {
		const { task, last } = setup();
		task.run(6);
		last().crash('failed to load');
		expect(last().terminated).toBe(true);
		expect(task.synchronous).toBe(true);
		expect(task.output).toBe(36);
		expect(task.status).toBe('idle');
		task.run(7);
		expect(task.output).toBe(49);
	});

	it('reports a crash after loading and uses a new worker next time', () => {
		const { task, workers, last } = setup();
		task.run(6);
		last().ready();
		last().crash('out of memory');
		expect(task.status).toBe('error');
		expect(task.error).toBe('out of memory');
		expect(task.synchronous).toBe(false);
		task.run(7);
		expect(workers).toHaveLength(2);
	});

	it('reports an input that cannot be sent', () => {
		const { task, last } = setup();
		task.run(1);
		last().postMessage = () => {
			throw new Error('could not be cloned');
		};
		last().ready();
		last().respond();
		task.run(2);
		expect(task.status).toBe('error');
		expect(task.error).toBe('could not be cloned');
	});
});

describe('serveTask', () => {
	function scope() {
		const sent: unknown[] = [];
		const s: TaskScope & { sent: unknown[]; send: (data: unknown) => void } = {
			onmessage: null,
			postMessage: (m) => sent.push(m),
			sent,
			send: (data) => s.onmessage?.({ data } as MessageEvent)
		};
		return s;
	}

	it('announces it is ready, then answers each request', () => {
		const s = scope();
		serveTask(square, s);
		expect(s.sent).toEqual([READY]);
		s.send({ id: 4, input: 5 });
		expect(s.sent[1]).toEqual({ id: 4, ok: true, output: 25 });
	});

	it('answers an exception with an error', () => {
		const s = scope();
		serveTask(() => {
			throw new Error('nope');
		}, s);
		s.send({ id: 1, input: 0 });
		expect(s.sent[1]).toEqual({ id: 1, ok: false, error: 'nope' });
	});

	it('answers an output that cannot be cloned with an error', () => {
		const s = scope();
		serveTask(square, s);
		let first = true;
		s.postMessage = (m) => {
			if (first) {
				first = false;
				throw new Error('DataCloneError');
			}
			s.sent.push(m);
		};
		s.send({ id: 2, input: 3 });
		expect(s.sent[1]).toEqual({ id: 2, ok: false, error: 'DataCloneError' });
	});
});
