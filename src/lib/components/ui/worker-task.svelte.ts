/**
 * Runs a pure computation in a Web Worker so the page stays responsive, with
 * the latest request winning:
 *
 * ```ts
 * const task = new WorkerTask({
 * 	compute: computeViews, // also the fallback on the main thread
 * 	worker: () => new Worker(new URL('./views.worker.ts', import.meta.url), { type: 'module' }),
 * 	initial: requestOf(model) // computed at once, so prerendering shows it
 * });
 * $effect(() => task.run(requestOf(model)));
 * // task.output, task.input: the newest finished result and what it was computed for
 * // task.status: 'idle' | 'working' | 'timed-out' | 'error'
 * ```
 *
 * - One request runs at a time and at most one waits; a newer request replaces
 *   the waiting one, and a response to an older request is dropped. A request
 *   that has already run `restartAfter` ms when a newer one arrives is
 *   abandoned (the worker is restarted).
 * - A request still running after `timeLimit` ms is abandoned: the worker is
 *   terminated (a new one is created for the next request) and, when it was
 *   the latest request, the status becomes 'timed-out'. The clock starts once
 *   the worker has loaded.
 * - Without a worker (prerendering, tests, `worker` missing or failing to
 *   load) `compute` runs on the main thread, where no time limit applies.
 */
import { onDestroy, untrack } from 'svelte';
import { READY, errorText, type TaskMessage, type TaskWorker } from './worker-protocol';

export type TaskStatus = 'idle' | 'working' | 'timed-out' | 'error';

export const DEFAULT_TIME_LIMIT = 5000;
export const DEFAULT_RESTART_AFTER = 300;

export interface WorkerTaskOptions<I, O> {
	/** The computation: run by the worker, or on the main thread when there is no worker. */
	compute: (input: I) => O;
	/**
	 * Creates the worker. Called on the first `run` (never while prerendering,
	 * when `run` is called from an effect); when it is missing or throws,
	 * `compute` runs on the main thread.
	 */
	worker?: () => TaskWorker;
	/** Computed at once on the main thread (so the prerendered page shows it); keep it cheap. */
	initial?: I;
	/** Milliseconds a request may run before it is abandoned. */
	timeLimit?: number;
	/** Milliseconds after which a running request gives way to a newer one. */
	restartAfter?: number;
	/** Requests with equal keys are the same request (default `JSON.stringify`). */
	key?: (input: I) => string;
	/** Called, untracked, with each output as it becomes `output`. */
	onresult?: (output: O, input: I) => void;
}

interface Request<I> {
	id: number;
	input: I;
	key: string;
}

export class WorkerTask<I, O> {
	#status = $state<TaskStatus>('idle');
	#output = $state.raw<O | null>(null);
	#input = $state.raw<I | null>(null);
	#error = $state<string | null>(null);

	readonly #compute: (input: I) => O;
	readonly #create: (() => TaskWorker) | undefined;
	readonly #timeLimit: number;
	readonly #restartAfter: number;
	readonly #key: (input: I) => string;
	readonly #onresult: ((output: O, input: I) => void) | undefined;

	#seq = 0;
	/** The last request made. */
	#latest: Request<I> | null = null;
	/** Key of `input`. */
	#doneKey: string | null = null;
	/** The request the worker is computing; `started` is null until the worker is ready. */
	#flight: (Request<I> & { started: number | null }) | null = null;
	/** The request to post when the worker is free. */
	#queued: Request<I> | null = null;
	#worker: TaskWorker | null = null;
	#ready = false;
	/** Compute on the main thread (no worker, or it failed to load). */
	#sync: boolean;
	#timer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: WorkerTaskOptions<I, O>) {
		this.#compute = options.compute;
		this.#create = options.worker;
		this.#timeLimit = options.timeLimit ?? DEFAULT_TIME_LIMIT;
		this.#restartAfter = options.restartAfter ?? DEFAULT_RESTART_AFTER;
		this.#key = options.key ?? ((input) => JSON.stringify(input));
		this.#onresult = options.onresult;
		this.#sync = options.worker === undefined;
		if (options.initial !== undefined) this.#computeHere(this.#request(options.initial));
		try {
			onDestroy(() => this.dispose());
		} catch {
			// Created outside component initialisation: the owner must call dispose().
		}
	}

	/** 'working' while the latest request is being computed. */
	get status(): TaskStatus {
		return this.#status;
	}

	/** The newest finished output (kept while newer requests run, and after a time-out or error). */
	get output(): O | null {
		return this.#output;
	}

	/** The input `output` was computed for. */
	get input(): I | null {
		return this.#input;
	}

	/** What went wrong, when the status is 'error'. */
	get error(): string | null {
		return this.#error;
	}

	/** True when `compute` runs on the main thread. */
	get synchronous(): boolean {
		return this.#sync;
	}

	/** Computes `input`, unless it is the request made last. */
	run(input: I): void {
		untrack(() => this.#run(input));
	}

	/** Stops the worker. Called automatically when the owning component is destroyed. */
	dispose(): void {
		this.#stopWorker();
		this.#queued = null;
	}

	#run(input: I) {
		const key = this.#key(input);
		if (this.#latest?.key === key) return;
		const req = this.#request(input, key);
		if (key === this.#doneKey) {
			// Back to the input `output` is for: nothing to wait for.
			this.#queued = null;
			this.#status = 'idle';
			this.#error = null;
			return;
		}
		this.#status = 'working';
		const flight = this.#flight;
		if (!flight) this.#dispatch(req);
		else if (flight.started !== null && Date.now() - flight.started >= this.#restartAfter) {
			this.#stopWorker();
			this.#dispatch(req);
		} else this.#queued = req;
	}

	/** Posts `req` to the worker (started if needed), or computes it here when there is none. */
	#dispatch(req: Request<I>) {
		if (!this.#sync && !this.#worker) this.#startWorker();
		if (this.#sync) this.#computeHere(req);
		else this.#post(req);
	}

	#request(input: I, key = this.#key(input)): Request<I> {
		const req = { id: ++this.#seq, input, key };
		this.#latest = req;
		return req;
	}

	#isLatest(req: Request<I>) {
		return req.id === this.#latest?.id;
	}

	#computeHere(req: Request<I>) {
		let output: O;
		try {
			output = this.#compute(req.input);
		} catch (e) {
			if (this.#isLatest(req)) this.#fail(errorText(e));
			return;
		}
		if (this.#isLatest(req)) this.#deliver(req, output);
	}

	#deliver(req: Request<I>, output: O) {
		this.#output = output;
		this.#input = req.input;
		this.#doneKey = req.key;
		this.#status = 'idle';
		this.#error = null;
		const onresult = this.#onresult;
		if (onresult) untrack(() => onresult(output, req.input));
	}

	#fail(error: string) {
		this.#status = 'error';
		this.#error = error;
	}

	#startWorker() {
		let worker: TaskWorker;
		try {
			worker = this.#create!();
		} catch {
			this.#sync = true;
			return;
		}
		this.#worker = worker;
		this.#ready = false;
		worker.onmessage = (event) => {
			if (this.#worker === worker) this.#onmessage(event.data as TaskMessage<O>);
		};
		worker.onerror = (event) => {
			event.preventDefault();
			if (this.#worker === worker) this.#onerror(event);
		};
	}

	#stopWorker() {
		this.#clearTimer();
		this.#worker?.terminate();
		this.#worker = null;
		this.#ready = false;
		this.#flight = null;
	}

	#post(req: Request<I>) {
		this.#flight = { ...req, started: null };
		try {
			this.#worker!.postMessage({ id: req.id, input: req.input });
		} catch (e) {
			// The input cannot be cloned.
			this.#flight = null;
			if (this.#isLatest(req)) this.#fail(errorText(e));
			return;
		}
		if (this.#ready) this.#startClock();
	}

	#startClock() {
		const flight = this.#flight;
		if (!flight) return;
		flight.started = Date.now();
		this.#clearTimer();
		this.#timer = setTimeout(() => this.#timeout(), this.#timeLimit);
	}

	#clearTimer() {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}

	#onmessage(message: TaskMessage<O>) {
		if (message === READY) {
			this.#ready = true;
			this.#startClock();
			return;
		}
		const flight = this.#flight;
		if (!flight || message.id !== flight.id) return;
		this.#clearTimer();
		this.#flight = null;
		if (this.#isLatest(flight)) {
			if (message.ok) this.#deliver(flight, message.output);
			else this.#fail(message.error);
		}
		this.#postQueued();
	}

	#onerror(event: ErrorEvent) {
		const flight = this.#flight;
		const loaded = this.#ready;
		this.#stopWorker();
		if (!loaded) {
			// The worker did not load (e.g. no module workers): compute here from now on.
			this.#sync = true;
			this.#queued = null;
			const latest = this.#latest;
			if (latest && latest.key !== this.#doneKey) this.#computeHere(latest);
			return;
		}
		if (flight && this.#isLatest(flight)) this.#fail(event.message || 'The worker stopped.');
		this.#postQueued();
	}

	#timeout() {
		const flight = this.#flight;
		this.#stopWorker();
		if (flight && this.#isLatest(flight)) {
			this.#status = 'timed-out';
			this.#error = null;
		}
		this.#postQueued();
	}

	#postQueued() {
		const next = this.#queued;
		this.#queued = null;
		if (next) this.#dispatch(next);
	}
}
