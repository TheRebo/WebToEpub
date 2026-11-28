/**
 * Following a background job.
 *
 * The poll has to keep going when the worker is briefly unavailable, and it
 * has to stop when the job will never come back. These tests cover both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollUntilDone } from "../../../src/ui/poll";

describe("pollUntilDone", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps polling while the work succeeds", async () => {
        let calls = 0;
        const stop = pollUntilDone<number>({
            intervalMs: 100,
            step: async () => {
                calls += 1;
                return calls;
            },
        });

        await vi.advanceTimersByTimeAsync(350);
        expect(calls).toBeGreaterThanOrEqual(3);
        stop();
    });

    it("stops when the work is done", async () => {
        let calls = 0;
        const stop = pollUntilDone<number>({
            intervalMs: 100,
            step: async () => {
                calls += 1;
                return calls < 3 ? calls : undefined;
            },
        });

        await vi.advanceTimersByTimeAsync(1000);
        expect(calls).toBe(3);
        stop();
    });

    it("keeps going through a transient failure", async () => {
        let calls = 0;
        const stop = pollUntilDone<number>({
            intervalMs: 100,
            maxFailures: 3,
            step: async () => {
                calls += 1;
                if (calls === 1) throw new Error("The worker is asleep.");
                return calls;
            },
        });

        await vi.advanceTimersByTimeAsync(500);
        expect(calls).toBeGreaterThanOrEqual(2);
        stop();
    });

    it("gives up after a run of failures", async () => {
        let calls = 0;
        let gaveUp = false;
        const stop = pollUntilDone<number>({
            intervalMs: 100,
            maxFailures: 3,
            step: async () => {
                calls += 1;
                throw new Error("No such job.");
            },
            onGiveUp: () => {
                gaveUp = true;
            },
        });

        await vi.advanceTimersByTimeAsync(1000);
        expect(gaveUp).toBe(true);
        // The poll must actually stop, not keep asking for ever.
        expect(calls).toBe(3);
        stop();
    });

    it("stops when it is told to", async () => {
        let calls = 0;
        const stop = pollUntilDone<number>({
            intervalMs: 100,
            step: async () => {
                calls += 1;
                return calls;
            },
        });

        await vi.advanceTimersByTimeAsync(250);
        const seen = calls;
        stop();
        await vi.advanceTimersByTimeAsync(1000);
        expect(calls).toBe(seen);
    });

    it("does not call the work again after it is stopped", async () => {
        let calls = 0;
        const stop = pollUntilDone<number>({
            intervalMs: 100,
            step: async () => {
                calls += 1;
                await new Promise((resolve) => setTimeout(resolve, 50));
                return calls;
            },
        });

        // Stop while the work is still in flight.
        await vi.advanceTimersByTimeAsync(10);
        stop();
        await vi.advanceTimersByTimeAsync(1000);
        expect(calls).toBe(1);
    });
});
