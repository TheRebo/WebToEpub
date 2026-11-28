/**
 * Following a background job.
 *
 * The popup and the workbench both follow a download by asking the worker how
 * it is going. The polling has two failure modes, and only one of them is
 * obvious:
 *
 *  - The worker is busy or asleep, and the request fails. This is transient:
 *    the job's state is durable, so the right thing to do is to try again.
 *  - The job is gone. The worker has been restarted, or the job was cleaned
 *    up. The request fails with "No such job", and it will fail the same way
 *    for ever.
 *
 * The second case is the one that turns a harmless poll into a busy loop: the
 * page asks every 500 milliseconds for a job that no longer exists, for as
 * long as the page is open, and nothing tells the user why the progress bar
 * has stopped moving.
 *
 * `pollUntilDone` therefore gives up after a run of failures, and says so.
 */

/** How many consecutive failures are tolerated before giving up. */
export const DEFAULT_MAX_POLL_FAILURES = 5;

/** The options for a poll. */
export interface PollOptions<T> {
    /** The work to do. It resolves to `undefined` when there is nothing more to do. */
    step(): Promise<T | undefined>;
    /** How long to wait between attempts, in milliseconds. */
    intervalMs: number;
    /** How many consecutive failures to tolerate. */
    maxFailures?: number;
    /** Called when the poll gives up. */
    onGiveUp?(error: unknown): void;
    /** Called after every successful step, with the number of failures that preceded it. */
    onSuccess?(value: T): void;
}

/**
 * Poll until the work is done, the work fails permanently, or the page goes
 * away.
 *
 * @param options How to poll.
 * @returns A function that stops the poll.
 */
export function pollUntilDone<T>(options: PollOptions<T>): () => void {
    const maxFailures = options.maxFailures ?? DEFAULT_MAX_POLL_FAILURES;
    let failures = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = (): void => {
        stopped = true;
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    };

    const tick = async (): Promise<void> => {
        if (stopped) return;
        try {
            const value = await options.step();
            if (stopped) return;
            failures = 0;
            if (value === undefined) {
                stop();
                return;
            }
            options.onSuccess?.(value);
        } catch (error) {
            if (stopped) return;
            failures += 1;
            if (failures >= maxFailures) {
                // The job is not coming back. Stop asking, and tell the user
                // rather than leaving a bar that has stopped moving.
                stop();
                options.onGiveUp?.(error);
                return;
            }
        }
        if (stopped) return;
        timer = setTimeout(() => void tick(), options.intervalMs);
    };

    void tick();
    return stop;
}
