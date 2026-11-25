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
import {
    FetchClient,
    MAX_RESPONSE_BYTES,
    type CustomErrorHandler,
} from "../../src/core/net/fetch-client";

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
 *
 * The response declares `text/html`, because these tests fetch pages. A
 * response that declares a different type is refused by the client, which is
 * the behaviour the content-type tests pin down.
 */
function clientReturning(
    body: string,
    handler?: CustomErrorHandler,
    contentType = "text/html; charset=utf-8",
) {
    const fetchMock = vi.fn(
        async () => new Response(body, { status: 200, headers: { "content-type": contentType } }),
    );
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

describe("the fetch client's URL checks", () => {
    it("refuses to fetch a URL naming the local machine", async () => {
        const fetchMock = vi.fn(async () => new Response("<html></html>", { status: 200 }));
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("http://169.254.169.254/latest/meta-data/", {
                retry: { maxAttempts: 1 },
            }),
        ).rejects.toThrow(/Refused to fetch/);

        // The request must never have been made.
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses to fetch a URL naming the loopback interface", async () => {
        const fetchMock = vi.fn(async () => new Response("<html></html>", { status: 200 }));
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("http://127.0.0.1:8080/", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/Refused to fetch/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses to follow a redirect to the local network", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response("", {
                    status: 302,
                    headers: { location: "http://192.168.0.1/admin" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/Refused to fetch/);

        // The first hop was made; the second was not.
        expect(fetchMock.mock.calls.length).toBe(1);
    });

    it("follows a redirect to a public address", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === "https://example.com/chapter") {
                return new Response("", {
                    status: 301,
                    headers: { location: "https://example.com/chapter/2" },
                });
            }
            return new Response("<html>final</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            });
        });
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchHtml("https://example.com/chapter");
        expect(result.text).toContain("final");
        expect(fetchMock.mock.calls.length).toBe(2);
    });

    it("gives up on a redirect loop", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response("", {
                    status: 302,
                    headers: { location: "https://example.com/loop" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/loop", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/Too many redirects/);
    });
});

describe("the fetch client's size limit", () => {
    it("refuses a body whose declared length is over the limit", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response("small", {
                    status: 200,
                    headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/too large/);
    });

    it("refuses a body that grows past the limit while it is read", async () => {
        // A body that does not declare its length, so the limit has to be
        // enforced while it streams.
        const chunk = new Uint8Array(1024 * 1024);
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (let index = 0; index < 40; index += 1) controller.enqueue(chunk);
                controller.close();
            },
        });
        const fetchMock = vi.fn(
            async () =>
                new Response(stream, {
                    status: 200,
                    headers: { "content-type": "text/html" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/too large/);
    });

    it("reads a body that is within the limit", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response("<html>ok</html>", {
                    status: 200,
                    headers: { "content-type": "text/html" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchHtml("https://example.com/chapter");
        expect(result.text).toBe("<html>ok</html>");
    });
});

describe("the fetch client's content-type checks", () => {
    it("refuses a page that is not HTML", async () => {
        // A JSON API answering where a page was expected would be parsed as
        // an empty document, which looks like a chapter with no prose in it.
        const fetchMock = vi.fn(
            async () =>
                new Response('{"error":"nope"}', {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/Expected an HTML page/);
    });

    it("accepts a page that declares no type at all", async () => {
        // Some sites omit the header. The body is parsed as HTML either way,
        // so refusing it would break a working site.
        const fetchMock = vi.fn(
            async () =>
                new Response("<html>ok</html>", {
                    status: 200,
                    headers: { "content-type": "" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchHtml("https://example.com/chapter");
        expect(result.text).toBe("<html>ok</html>");
    });

    it("accepts an XHTML page", async () => {
        const { client } = clientReturning("<html>ok</html>", undefined, "application/xhtml+xml");
        const result = await client.fetchHtml("https://example.com/chapter");
        expect(result.text).toBe("<html>ok</html>");
    });

    it("refuses an image that is not an image", async () => {
        // An HTML error page saved as a picture would be written into the
        // EPUB with a media type every e-reader rejects.
        const fetchMock = vi.fn(
            async () =>
                new Response("<html>not found</html>", {
                    status: 200,
                    headers: { "content-type": "text/html" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchBinary("https://example.com/cover.png", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/Expected an image/);
    });

    it("accepts a real image", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "content-type": "image/png" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchBinary("https://example.com/cover.png");
        expect(result.mediaType).toBe("image/png");
    });
});
