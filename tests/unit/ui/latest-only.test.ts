/**
 * The guard that keeps only the newest of a series of overlapping operations.
 *
 * The bug it exists for is the one where two slow operations overlap: the
 * older one finishes last and puts its result on top of the newer one, so the
 * user sees the result of the thing they moved away from.
 */
import { describe, expect, it } from "vitest";
import { LatestOnly } from "../../../src/ui/latest-only";

describe("LatestOnly", () => {
    it("says the first attempt is current", () => {
        const guard = new LatestOnly();
        const first = guard.begin();
        expect(guard.isCurrent(first)).toBe(true);
    });

    it("says the newest attempt is current", () => {
        const guard = new LatestOnly();
        guard.begin();
        const second = guard.begin();
        expect(guard.isCurrent(second)).toBe(true);
    });

    it("says an older attempt is not current", () => {
        const guard = new LatestOnly();
        const first = guard.begin();
        guard.begin();
        expect(guard.isCurrent(first)).toBe(false);
    });

    it("gives every attempt its own number", () => {
        const guard = new LatestOnly();
        const first = guard.begin();
        const second = guard.begin();
        expect(first).not.toBe(second);
    });

    it("keeps the newest attempt current after an older one is asked about", () => {
        // Asking whether an old attempt is current must not change the answer
        // for the new one.
        const guard = new LatestOnly();
        const first = guard.begin();
        const second = guard.begin();
        expect(guard.isCurrent(first)).toBe(false);
        expect(guard.isCurrent(second)).toBe(true);
    });

    it("reports the number of the newest attempt", () => {
        const guard = new LatestOnly();
        const first = guard.begin();
        const second = guard.begin();
        expect(guard.current).toBe(second);
        expect(guard.current).not.toBe(first);
    });
});
