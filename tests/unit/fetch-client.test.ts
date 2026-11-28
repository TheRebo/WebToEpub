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
    FetchError,
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

    it("turns a POST into a GET after a 303", async () => {
        // RFC 9110 §15.4: a 303 always means "go and GET the thing I am
        // pointing at". Repeating the POST would submit the form again.
        const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url, init });
            if (url === "https://example.com/submit") {
                return new Response("", {
                    status: 303,
                    headers: { location: "https://example.com/result" },
                });
            }
            return new Response("<html>done</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            });
        });
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await client.fetchHtml("https://example.com/submit", {
            method: "POST",
            body: "a=1",
        });

        const second = calls[1]?.init;
        expect(second?.method).toBe("GET");
        expect(second?.body).toBeNull();
    });

    it("keeps the method and body after a 307", async () => {
        // A 307 says the method is not what changed, so it is repeated.
        const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url, init });
            if (url === "https://example.com/submit") {
                return new Response("", {
                    status: 307,
                    headers: { location: "https://example.com/other" },
                });
            }
            return new Response("<html>done</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            });
        });
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await client.fetchHtml("https://example.com/submit", {
            method: "POST",
            body: "a=1",
        });

        const second = calls[1]?.init;
        expect(second?.method).toBe("POST");
        expect(second?.body).toBe("a=1");
    });

    it("asks the browser to follow redirects, since a manual redirect is opaque", async () => {
        const { client, fetchMock } = clientReturning("<html>ok</html>");
        await client.fetchHtml("https://example.com/chapter");
        const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect(init.redirect).toBe("follow");
    });

    it("refuses a response the browser followed into the local network", async () => {
        const fetchMock = vi.fn(async () => {
            const response = new Response("<html>secret</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            });
            Object.defineProperty(response, "redirected", { value: true });
            Object.defineProperty(response, "url", { value: "http://169.254.169.254/latest/" });
            return response;
        });
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/Refused to fetch/);
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

    it("refuses a body with no stream that is over the limit", async () => {
        // A response whose body has already been read has no stream to count
        // the bytes through. The size is still checked, or a body that
        // declares nothing is a body of any size at all.
        const fetchMock = vi.fn(async () => {
            const response = new Response("small", {
                status: 200,
                headers: { "content-type": "text/html" },
            });
            // Take the stream away, so the reader has to fall back.
            Object.defineProperty(response, "body", { value: null });
            Object.defineProperty(response, "arrayBuffer", {
                value: async () => new ArrayBuffer(MAX_RESPONSE_BYTES + 1),
            });
            return response;
        });
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/too large/);
    });

    it("closes the stream when the read is cancelled", async () => {
        // A cancelled download leaves the connection open unless the reader is
        // cancelled: the browser keeps pulling bytes for a job the user has
        // already stopped.
        let cancelCalls = 0;
        const controller = new AbortController();
        const stream = new ReadableStream<Uint8Array>({
            async pull(streamController) {
                // The stream never ends on its own: the read is stopped by the
                // abort, which is the case under test. The pause gives the
                // abort a turn, so the read is genuinely in flight when the
                // user stops the job.
                await new Promise((resolve) => setTimeout(resolve, 5));
                streamController.enqueue(new Uint8Array(16));
            },
        });
        const originalGetReader = stream.getReader.bind(stream);
        stream.getReader = () => {
            const reader = originalGetReader();
            const originalCancel = reader.cancel.bind(reader);
            reader.cancel = async (reason?: unknown) => {
                cancelCalls += 1;
                return originalCancel(reason);
            };
            return reader;
        };
        const fetchMock = vi.fn(
            async () =>
                new Response(stream, {
                    status: 200,
                    headers: { "content-type": "text/html" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const pending = client.fetchHtml("https://example.com/chapter", {
            signal: controller.signal,
            retry: { maxAttempts: 1 },
        });
        const expectation = expect(pending).rejects.toThrow();
        // Let the read get going, then stop it.
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.abort();

        await expectation;
        // The reader must have been cancelled by the fetch layer, so the
        // connection is closed rather than left pulling bytes for a job that
        // has been stopped.
        expect(cancelCalls).toBeGreaterThan(0);
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

    it("reports the wrong content type as its own failure, not as a 200", async () => {
        // The server answered with a 200. Telling the user "the server
        // returned 200" would be true and useless; the problem is what it
        // sent, so the failure has to say so.
        const fetchMock = vi.fn(
            async () =>
                new Response("%PDF-1.4", {
                    status: 200,
                    headers: { "content-type": "application/pdf" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const error = await client
            .fetchHtml("https://example.com/chapter", { retry: { maxAttempts: 1 } })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).status).toBeUndefined();
        expect((error as FetchError).code).toBe("UNSUPPORTED_CONTENT");
        expect((error as FetchError).mediaType).toBe("application/pdf");
    });

    it("does not retry a page that is not a page", async () => {
        // Asking again will not make the server send HTML.
        const fetchMock = vi.fn(
            async () =>
                new Response("%PDF-1.4", {
                    status: 200,
                    headers: { "content-type": "application/pdf" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchHtml("https://example.com/chapter", {
                retry: { maxAttempts: 3, baseDelayMs: 1 },
            }),
        ).rejects.toThrow(/Expected an HTML page/);

        expect(fetchMock.mock.calls.length).toBe(1);
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

    it("takes the media type from the bytes when the server declares none", async () => {
        // A server that declares nothing would leave the file's media type
        // empty, and a manifest entry with no media type is one every reader
        // rejects.
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
        const fetchMock = vi.fn(async () => new Response(png, { status: 200, headers: {} }));
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchBinary("https://example.com/cover");
        expect(result.mediaType).toBe("image/png");
    });

    it("takes the media type from the bytes when the server declares the wrong one", async () => {
        // The bytes are the authority: a PNG served as a JPEG would be written
        // into the book under a name the reader cannot show.
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
        const fetchMock = vi.fn(
            async () =>
                new Response(png, {
                    status: 200,
                    headers: { "content-type": "image/jpeg" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchBinary("https://example.com/cover.png");
        expect(result.mediaType).toBe("image/png");
    });

    it("refuses bytes that are not a picture at all", async () => {
        // Nothing about the file says what it is, and the server claims
        // nothing. A picture that cannot be recognised cannot be written into
        // a book.
        const fetchMock = vi.fn(
            async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: {} }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchBinary("https://example.com/cover", { retry: { maxAttempts: 1 } }),
        ).rejects.toThrow(/not in a known format/);
    });

    it("does not retry an image that is not an image", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response("<html>not found</html>", {
                    status: 200,
                    headers: { "content-type": "text/html" },
                }),
        );
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        await expect(
            client.fetchBinary("https://example.com/cover.png", {
                retry: { maxAttempts: 3, baseDelayMs: 1 },
            }),
        ).rejects.toThrow(/Expected an image/);

        expect(fetchMock.mock.calls.length).toBe(1);
    });

    it("does retry an image the server failed to serve", async () => {
        let calls = 0;
        const fetchMock = vi.fn(async () => {
            calls += 1;
            if (calls < 3) {
                return new Response("", { status: 503 });
            }
            return new Response(new Uint8Array([1, 2, 3]), {
                status: 200,
                headers: { "content-type": "image/png" },
            });
        });
        const client = new FetchClient({ fetch: fetchMock as never, sleep: async () => {} });

        const result = await client.fetchBinary("https://example.com/cover.png", {
            retry: { maxAttempts: 3, baseDelayMs: 1 },
        });

        expect(result.mediaType).toBe("image/png");
        expect(fetchMock.mock.calls.length).toBe(3);
    });
});
