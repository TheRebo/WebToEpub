/**
 * Starting work that the user asked for, without waiting for it.
 *
 * The bug: an event handler cannot be `async`, so the promise it returns is
 * dropped and a rejection from it is never handled. The browser logs an
 * unhandled rejection, the user is told nothing, and the thing they asked for
 * silently does not happen.
 */
import { describe, expect, it, vi } from "vitest";
import { runGuarded } from "../../../src/ui/guarded";

describe("runGuarded", () => {
    it("starts the work", async () => {
        const work = vi.fn(async () => undefined);
        runGuarded(work, () => undefined);
        // The work is started on the same turn, not after a microtask.
        expect(work).toHaveBeenCalledTimes(1);
        await Promise.resolve();
    });

    it("reports a failure instead of dropping it", async () => {
        const failure = new Error("the disk is full");
        const report = vi.fn();
        runGuarded(async () => {
            throw failure;
        }, report);
        await Promise.resolve();
        await Promise.resolve();
        expect(report).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenCalledWith(failure);
    });

    it("does not report anything when the work succeeds", async () => {
        const report = vi.fn();
        runGuarded(async () => "done", report);
        await Promise.resolve();
        await Promise.resolve();
        expect(report).not.toHaveBeenCalled();
    });

    it("reports a failure that is not an error", async () => {
        // A rejection can be anything at all, and the reporter has to cope.
        const report = vi.fn();
        runGuarded(async () => {
            throw "a string";
        }, report);
        await Promise.resolve();
        await Promise.resolve();
        expect(report).toHaveBeenCalledWith("a string");
    });
});
