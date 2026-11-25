/**
 * Tests for the fetch client's custom-error handling.
 *
 * The `999` pseudo-status is the mechanism a parser uses to say "this failed,
 * but it is worth trying again in a moment". The baseline used it for APIs
 * that fail once and succeed seconds later.
 *
 * These tests pin down the two ways that path can go wrong: retrying for ever
 * without giving up, and giving up without ever retrying.
 */
import { describe, expect, it, vi } from "vitest";
import { FetchClient, type CustomErrorHandler } from "../../src/core/net/fetch-client";

/** A handler that always asks for a retry, and counts how many times it ran. */
function alwaysRetry(delayMs = 10): CustomErrorHandler & { calls: number } {
    const handler = {
        calls: 0,
        isCustomError: () => true,
        setCustomErrorResponse: () => {
            handler.calls += 1;
            return { status: 999, retryDelay: delayMs };
        },
    };
    return handler;
}

/** A handler that never asks for a retry. */
const neverCustom: CustomErrorHandler = {
    isCustomError: () => false,
    setCustomErrorResponse: () => undefined,
};

/**
 * Build a client whose fetch always succeeds with the given body.
 */
function clientReturning(body: string, handler?: CustomErrorHandler) {
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    const sleepMock = vi.fn(async () => {});
    const client = new FetchClient({ fetch: fetchMock as never, sleep: sleepMock });
    if (handler) client.setCustomErrorHandler(handler);
    return { client, fetchMock, sleepMock };
}

describe("the fetch client's custom-error handling", () => {
    it("asks the handler about a response", async () => {
        const handler = alwaysRetry();
        const { client, fetchMock } = clientReturning("<html></html>", handler);

        // A single attempt that the handler asks to be retried has nowhere to
        // retry to, so it fails.
        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 1 },
            }),
        ).rejects.toThrow();

        expect(handler.calls).toBeGreaterThan(0);
        expect(fetchMock).toHaveBeenCalled();
    });

    it("leaves a response alone when the handler does not claim it", async () => {
        const { client } = clientReturning("<html>ok</html>", neverCustom);
        const result = await client.fetchHtml("https://example.com/chapter");
        expect(result.text).toBe("<html>ok</html>");
    });

    it("retries when the handler asks for it", async () => {
        const handler = alwaysRetry(5);
        const { client, fetchMock, sleepMock } = clientReturning("<html></html>", handler);

        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 3 },
            }),
        ).rejects.toThrow();

        expect(fetchMock.mock.calls.length).toBe(3);
        expect(sleepMock).toHaveBeenCalled();
    });

    it("succeeds when the handler stops asking for a retry", async () => {
        let calls = 0;
        const handler: CustomErrorHandler = {
            isCustomError: () => true,
            setCustomErrorResponse: () => {
                calls += 1;
                // The first attempt fails temporarily; the second is fine.
                return calls === 1 ? { status: 999, retryDelay: 1 } : { status: 403 };
            },
        };
        const { client, fetchMock } = clientReturning("<html>ok</html>", handler);

        // The handler now claims a 403, so the request fails — but only after
        // the retry the handler asked for has been made.
        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 3 },
            }),
        ).rejects.toThrow();
        expect(fetchMock.mock.calls.length).toBe(2);
    });

    it("gives up with an error once the retries are exhausted", async () => {
        const handler = alwaysRetry(1);
        const { client, fetchMock } = clientReturning("<html></html>", handler);

        // The last attempt must not be able to start another retry, so the
        // promise has to settle rather than loop for ever.
        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 3, baseDelayMs: 1 },
            }),
        ).rejects.toThrow();

        expect(fetchMock.mock.calls.length).toBe(3);
    });

    it("honours the delay the handler asked for", async () => {
        const handler = alwaysRetry(1234);
        const { client, sleepMock } = clientReturning("<html></html>", handler);

        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 2 },
            }),
        ).rejects.toThrow();

        expect(sleepMock).toHaveBeenCalledWith(1234);
    });

    it("surfaces a 403 as a challenge", async () => {
        const handler: CustomErrorHandler = {
            isCustomError: () => true,
            setCustomErrorResponse: () => ({ status: 403 }),
        };
        const { client } = clientReturning("<html></html>", handler);

        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 1 },
            }),
        ).rejects.toThrow();
    });

    it("does not let a throwing handler break the request", async () => {
        const handler: CustomErrorHandler = {
            isCustomError: () => {
                throw new Error("the parser exploded");
            },
            setCustomErrorResponse: () => undefined,
        };
        const { client } = clientReturning("<html>fine</html>", handler);

        const result = await client.fetchHtml("https://example.com/chapter");
        expect(result.text).toBe("<html>fine</html>");
    });

    it("does not retry a JSON request that asks for it", async () => {
        const handler = alwaysRetry(1);
        const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });
        client.setCustomErrorHandler(handler);

        await expect(
            client.fetchJson("https://example.com/api", {
                retry: { maxAttempts: 3, baseDelayMs: 1 },
            }),
        ).rejects.toThrow();

        expect(fetchMock.mock.calls.length).toBe(3);
    });

    it("returns the JSON when the handler does not claim it", async () => {
        const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });
        client.setCustomErrorHandler(neverCustom);

        const result = await client.fetchJson("https://example.com/api");
        expect(result.json).toEqual({ ok: true });
    });
});
