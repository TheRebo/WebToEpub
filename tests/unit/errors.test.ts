/**
 * Tests for the error model.
 *
 * The error crosses a boundary — from the worker to the page — so the URL it
 * carries is a place a secret can leak. A site's query string can hold a
 * session token, and the error travels over the message bus to the
 * extension's own pages, where it is shown to the user and written to the
 * console.
 */
import { describe, expect, it } from "vitest";
import {
    emptyContentError,
    redactUrl,
    toUserFacingError,
    UserFacingErrorError,
} from "../../src/core/util/errors";

describe("redactUrl", () => {
    it("removes the query string and the fragment", () => {
        expect(redactUrl("https://example.com/chapter/1?token=secret&id=42#part")).toBe(
            "https://example.com/chapter/1",
        );
    });

    it("keeps the path", () => {
        expect(redactUrl("https://example.com/novel/chapter-3")).toBe(
            "https://example.com/novel/chapter-3",
        );
    });

    it("returns nothing for a URL that will not parse", () => {
        // Passing it through unchanged would risk leaking the very query
        // string the redaction is there to remove.
        expect(redactUrl("not a url ?token=secret")).toBeUndefined();
    });

    it("returns nothing when there is no URL", () => {
        expect(redactUrl(undefined)).toBeUndefined();
    });
});

describe("toUserFacingError", () => {
    it("redacts the query string from the URL it reports", () => {
        const error = toUserFacingError(new Error("boom"), {
            url: "https://example.com/chapter?session=abcdef",
        });
        expect(error.url).toBe("https://example.com/chapter");
        expect(error.url).not.toContain("abcdef");
    });

    it("names the host in the message", () => {
        const error = toUserFacingError(new Error("boom"), {
            url: "https://example.com/chapter",
        });
        expect(error.message).toContain("example.com");
    });

    it("keeps the technical detail out of the message", () => {
        const error = toUserFacingError(new TypeError("x is not a function"), {
            url: "https://example.com/chapter",
        });
        expect(error.message).not.toContain("not a function");
        expect(error.detail).toContain("not a function");
    });

    it("recognises a cancelled request", () => {
        const error = toUserFacingError(new DOMException("aborted", "AbortError"));
        expect(error.code).toBe("CANCELLED");
    });

    it("recognises a full disk", () => {
        const error = toUserFacingError(new DOMException("full", "QuotaExceededError"));
        expect(error.code).toBe("STORAGE_FULL");
    });

    it("redacts the URL an error that knows its own URL carries", () => {
        const error = toUserFacingError(
            new UserFacingErrorError(
                "The chapter came back empty.",
                "EMPTY_CONTENT",
                undefined,
                "https://example.com/chapter?token=secret",
            ),
        );
        expect(error.url).toBe("https://example.com/chapter");
    });

    it("describes a rate-limited site", () => {
        const error = toUserFacingError(new Error("boom"), {
            url: "https://example.com/chapter",
            status: 429,
        });
        expect(error.code).toBe("RATE_LIMITED");
    });

    it("describes a challenge", () => {
        const error = toUserFacingError(new Error("boom"), {
            url: "https://example.com/chapter",
            challenge: true,
        });
        expect(error.code).toBe("CHALLENGE");
    });
});

describe("emptyContentError", () => {
    it("offers the user a way to carry on", () => {
        const error = emptyContentError("https://example.com/chapter").toUserFacingError();
        expect(error.code).toBe("EMPTY_CONTENT");
        expect(error.actions?.map((action) => action.id)).toContain("skip");
    });

    it("redacts its URL too", () => {
        const error = emptyContentError("https://example.com/chapter?token=secret");
        expect(error.toUserFacingError().url).toBe("https://example.com/chapter");
    });
});
