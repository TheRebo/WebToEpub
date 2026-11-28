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
        const error = toUserFacingError(
            new TypeError("NetworkError when attempting to fetch resource."),
            {
                url: "https://example.com/chapter",
            },
        );
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

    it("reads the status off the failure itself", () => {
        // The network layer knows the status the server answered with and
        // puts it on the error it throws. Nothing passes it in the context, so
        // without this the user would be told the site could not be reached
        // when the site answered with a 404.
        const failure = Object.assign(new Error("HTTP 404 for https://example.com/chapter"), {
            status: 404,
            attempts: 2,
        });
        const error = toUserFacingError(failure, { url: "https://example.com/chapter" });

        expect(error.code).toBe("HTTP_STATUS");
        expect(error.message).toContain("404");
        expect(error.message).toContain("example.com");
    });

    it("reads a challenge off the failure itself", () => {
        const failure = Object.assign(new Error("boom"), { status: 403, isChallenge: true });
        const error = toUserFacingError(failure, { url: "https://example.com/chapter" });

        expect(error.code).toBe("CHALLENGE");
    });

    it("treats a status of zero as a transport failure", () => {
        // A status of zero means the request never reached a server, so it
        // is not an answer from one.
        const failure = Object.assign(new Error("boom"), { status: 0 });
        const error = toUserFacingError(failure, { url: "https://example.com/chapter" });

        expect(error.code).toBe("NETWORK");
    });

    it("does not blame the network for a failure that did not come from it", () => {
        const error = toUserFacingError(new Error("The zip could not be written."), {
            url: "https://example.com/story",
        });
        expect(error.code).toBe("UNKNOWN");
        expect(error.message).not.toContain("reach");
    });

    it("lets the caller's own status win", () => {
        const failure = Object.assign(new Error("boom"), { status: 404 });
        const error = toUserFacingError(failure, {
            url: "https://example.com/chapter",
            status: 429,
        });

        expect(error.code).toBe("RATE_LIMITED");
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

describe("the technical detail of a failure", () => {
    it("never carries a URL's query string", async () => {
        const { toUserFacingError } = await import("../../src/core/util/errors");
        const failure = Object.assign(
            new Error("HTTP 500 for https://example.com/c?token=secret"),
            {
                name: "FetchError",
                status: 500,
            },
        );
        const error = toUserFacingError(failure);
        expect(error.detail).not.toContain("secret");
        expect(error.detail).toContain("example.com/c");
    });
});
