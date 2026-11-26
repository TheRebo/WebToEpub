/**
 * Tests for the message bus's payload validation.
 *
 * The bus is the boundary between the extension's own pages and the worker.
 * A message that arrives with the wrong shape must be answered with a clear
 * error, not handed to a handler that assumes the shape.
 *
 * The registry is also checked against what the interface actually sends. A
 * message nothing sends is dead weight — a payload rule to maintain, and a
 * handler to keep correct — and six of them had piled up that way.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    handleRequests,
    isValidPayload,
    REQUEST_NAMES,
    sendRequest,
    type MessagingListenerApi,
    type RequestName,
} from "../../src/core/message/bus";

/**
 * The message names the interface sends.
 *
 * The pages send a message by name — `sendRequest(transport, "page:analyze",
 * …)` — so the names are read out of the sources rather than tracked by hand.
 */
function sentMessageNames(): Set<string> {
    const root = join(process.cwd(), "src", "ui");
    const names = new Set<string>();
    const visit = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(path);
                continue;
            }
            if (!entry.name.endsWith(".ts")) continue;
            const source = readFileSync(path, "utf8");
            for (const match of source.matchAll(/"([a-z-]+:[a-z-]+)"/g)) {
                if (match[1]) names.add(match[1]);
            }
        }
    };
    visit(root);
    return names;
}

/**
 * Build a listener API that captures the handler, so a test can send it a
 * message and read the answer.
 */
function captureListener(): {
    api: MessagingListenerApi;
    send: (message: unknown) => Promise<unknown>;
} {
    let listener: ((message: unknown, sender: unknown) => Promise<unknown> | undefined) | undefined;
    const api: MessagingListenerApi = {
        onMessage: (handler) => {
            listener = handler;
        },
    };
    return {
        api,
        send: async (message) => {
            if (!listener) throw new Error("No listener was registered.");
            return listener(message, null);
        },
    };
}

/** A well-formed payload for each request that takes one. */
const VALID_PAYLOADS: Partial<Record<RequestName, unknown>> = {
    "page:analyze": { url: "https://example.com/story" },
    "chapters:list": { url: "https://example.com/story" },
    "download:start": {
        url: "https://example.com/story",
        title: "A Story",
        chapters: [{ sourceUrl: "https://example.com/c/1", title: "One" }],
    },
    "download:cancel": { jobId: "job-1" },
    "download:progress": { jobId: "job-1" },
    "library:delete": { id: "entry-1" },
    "site-selectors:suggest": { url: "https://example.com/story" },
    "site-selectors:test": {
        url: "https://example.com/story",
        contentCss: "article",
        titleCss: "h1",
        removeCss: ".ad",
    },
    "site-selectors:save": {
        hostname: "example.com",
        contentCss: "article",
        titleCss: "h1",
        removeCss: ".ad",
    },
    "site-selectors:remove": { hostname: "example.com" },
};

describe("isValidPayload", () => {
    it("accepts a well-formed payload for every request that takes one", () => {
        for (const [type, payload] of Object.entries(VALID_PAYLOADS)) {
            expect(isValidPayload(type as RequestName, payload)).toBe(true);
        }
    });

    it("accepts an empty payload for a request that takes none", () => {
        expect(isValidPayload("download:list", {})).toBe(true);
        expect(isValidPayload("library:list", {})).toBe(true);
        expect(isValidPayload("site-selectors:list", {})).toBe(true);
    });

    it("rejects a payload that is not an object", () => {
        expect(isValidPayload("page:analyze", undefined)).toBe(false);
        expect(isValidPayload("page:analyze", null)).toBe(false);
        expect(isValidPayload("page:analyze", "https://example.com")).toBe(false);
        expect(isValidPayload("page:analyze", 42)).toBe(false);
    });

    it("rejects a payload that is missing its field", () => {
        expect(isValidPayload("page:analyze", {})).toBe(false);
        expect(isValidPayload("download:cancel", {})).toBe(false);
        expect(isValidPayload("library:delete", {})).toBe(false);
        expect(isValidPayload("site-selectors:remove", {})).toBe(false);
    });

    it("rejects a field of the wrong type", () => {
        expect(isValidPayload("page:analyze", { url: 123 })).toBe(false);
        expect(isValidPayload("download:cancel", { jobId: {} })).toBe(false);
        expect(isValidPayload("library:delete", { id: null })).toBe(false);
    });

    it("rejects a download whose chapters are not a list", () => {
        expect(
            isValidPayload("download:start", {
                url: "https://example.com/story",
                title: "A Story",
                chapters: "one",
            }),
        ).toBe(false);
    });

    it("rejects a download whose chapter is malformed", () => {
        expect(
            isValidPayload("download:start", {
                url: "https://example.com/story",
                title: "A Story",
                chapters: [{ title: "One" }],
            }),
        ).toBe(false);
        expect(
            isValidPayload("download:start", {
                url: "https://example.com/story",
                title: "A Story",
                chapters: [{ sourceUrl: "https://example.com/c/1" }],
            }),
        ).toBe(false);
        expect(
            isValidPayload("download:start", {
                url: "https://example.com/story",
                title: "A Story",
                chapters: [null],
            }),
        ).toBe(false);
    });

    it("rejects an unknown request", () => {
        expect(isValidPayload("nope" as RequestName, {})).toBe(false);
    });

    it("rejects a host name that does not name a host", () => {
        // The host name is the key the selectors are filed under, and it
        // decides which site they are applied to.
        for (const hostname of [
            "https://evil.example/",
            "evil.example/path",
            "*.example.com",
            "user@evil.example",
            "",
        ]) {
            expect(isValidPayload("site-selectors:remove", { hostname })).toBe(false);
            expect(
                isValidPayload("site-selectors:save", {
                    hostname,
                    contentCss: "article",
                    titleCss: "h1",
                    removeCss: ".ad",
                }),
            ).toBe(false);
        }
    });

    it("accepts a host name that names a host", () => {
        expect(isValidPayload("site-selectors:remove", { hostname: "www.example.com" })).toBe(true);
    });
});

describe("handleRequests", () => {
    /** A handler that answers with a minimal, valid page analysis. */
    const okHandler = () => ({ supported: true });

    it("passes a valid payload to the handler", async () => {
        const { api, send } = captureListener();
        const handler = vi.fn(okHandler);
        await handleRequests(api, { "page:analyze": handler });

        const response = await send({
            type: "page:analyze",
            payload: { url: "https://example.com/story" },
            id: "1",
        });

        expect(handler).toHaveBeenCalledWith({ url: "https://example.com/story" });
        expect(response).toMatchObject({ id: "1", result: { supported: true } });
    });

    it("answers a malformed payload with an error, not a crash", async () => {
        const { api, send } = captureListener();
        const handler = vi.fn(okHandler);
        await handleRequests(api, { "page:analyze": handler });

        const response = (await send({
            type: "page:analyze",
            payload: { url: 123 },
            id: "1",
        })) as { error?: { message: string } };

        expect(handler).not.toHaveBeenCalled();
        expect(response.error).toBeDefined();
        expect(response.error?.message).toContain("malformed");
    });

    it("answers a missing payload with an error", async () => {
        const { api, send } = captureListener();
        await handleRequests(api, { "page:analyze": okHandler });

        const response = (await send({
            type: "page:analyze",
            id: "1",
        })) as { error?: { message: string } };

        expect(response.error).toBeDefined();
    });

    it("ignores a message that is not an envelope", async () => {
        const { api, send } = captureListener();
        await handleRequests(api, { "page:analyze": okHandler });

        expect(await send(null)).toBeUndefined();
        expect(await send("hello")).toBeUndefined();
        expect(await send({ payload: {} })).toBeUndefined();
    });

    it("ignores a request it has no handler for", async () => {
        const { api, send } = captureListener();
        await handleRequests(api, { "page:analyze": okHandler });

        expect(await send({ type: "library:list", payload: {}, id: "1" })).toBeUndefined();
    });

    it("turns a handler's exception into an error response", async () => {
        const { api, send } = captureListener();
        await handleRequests(api, {
            "page:analyze": () => {
                throw new Error("the site refused");
            },
        });

        const response = (await send({
            type: "page:analyze",
            payload: { url: "https://example.com/story" },
            id: "1",
        })) as { error?: { message: string; detail?: string } };

        // The user sees a sentence they can act on; the technical detail is
        // kept behind a disclosure rather than shown.
        expect(response.error?.message).toBe("Could not reach the site.");
        expect(response.error?.detail).toContain("the site refused");
    });
});

describe("sendRequest", () => {
    /**
     * An API that answers with the given payload, echoing the request's own
     * correlation ID.
     *
     * The echo matters: the client checks that the reply belongs to the
     * request it made.
     */
    function answering(payload: Record<string, unknown>) {
        return {
            sendMessage: async (message: unknown) => {
                const id = (message as { id: string }).id;
                return { id, ...payload };
            },
        };
    }

    it("returns the result of a successful response", async () => {
        const api = answering({ result: { supported: true } });
        const result = await sendRequest(api, "page:analyze", {
            url: "https://example.com/story",
        });
        expect(result).toEqual({ supported: true });
    });

    it("throws the error a failed response carries", async () => {
        const api = answering({
            error: { message: "no parser for this site", code: "UNKNOWN" },
        });
        await expect(
            sendRequest(api, "page:analyze", { url: "https://example.com/story" }),
        ).rejects.toThrow("no parser for this site");
    });

    it("keeps the error's code, so the UI can translate it", async () => {
        const api = answering({
            error: { message: "The site refused the request.", code: "HTTP_STATUS" },
        });
        await expect(
            sendRequest(api, "page:analyze", { url: "https://example.com/story" }),
        ).rejects.toMatchObject({ code: "HTTP_STATUS" });
    });

    it("throws when there is no response at all", async () => {
        const api = { sendMessage: async () => undefined };
        await expect(
            sendRequest(api, "page:analyze", { url: "https://example.com/story" }),
        ).rejects.toThrow("No response");
    });

    it("throws when the response carries no result", async () => {
        const api = answering({});
        await expect(
            sendRequest(api, "page:analyze", { url: "https://example.com/story" }),
        ).rejects.toThrow("Empty response");
    });

    it("refuses a response that answers a different request", async () => {
        // A reply that carries somebody else's ID did not answer this
        // request. Accepting it would put one request's result into
        // another's place.
        const api = {
            sendMessage: async () => ({ id: "somebody-else", result: { supported: true } }),
        };
        await expect(
            sendRequest(api, "page:analyze", { url: "https://example.com/story" }),
        ).rejects.toThrow("Mismatched response");
    });
});

describe("the message registry", () => {
    it("declares a message only when the interface sends one", () => {
        // Six messages were declared, had a handler, and were never sent.
        const sent = sentMessageNames();
        for (const name of REQUEST_NAMES) {
            expect(sent.has(name), `"${name}" is declared but never sent`).toBe(true);
        }
    });

    it("declares every message the interface sends", () => {
        const sent = sentMessageNames();
        for (const name of sent) {
            expect(
                (REQUEST_NAMES as readonly string[]).includes(name),
                `"${name}" is sent but not declared`,
            ).toBe(true);
        }
    });

    it("names every request once", () => {
        expect(new Set(REQUEST_NAMES).size).toBe(REQUEST_NAMES.length);
    });
});
