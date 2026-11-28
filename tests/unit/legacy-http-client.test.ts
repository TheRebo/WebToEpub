/**
 * The legacy HttpClient shim, which the 434 migrated parsers call.
 */
import { describe, expect, it, vi } from "vitest";
import { FetchClient } from "../../src/core/net/fetch-client";
import { HttpClient, installFetchClient } from "../../src/core/parsers/compat/legacy-http-client";

/** "中文" in GBK. */
const GBK = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);

function install(body: Uint8Array, contentType: string): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(
        async () =>
            new Response(body as BodyInit, {
                status: 200,
                headers: { "content-type": contentType },
            }),
    );
    installFetchClient(new FetchClient({ fetch: fetchMock as never, sleep: async () => {} }));
    return fetchMock;
}

describe("the legacy HttpClient", () => {
    it("reads a page with the decoder the parser asked for", async () => {
        const page = new Uint8Array([
            ...new TextEncoder().encode("<html><body><p>"),
            ...GBK,
            ...new TextEncoder().encode("</p></body></html>"),
        ]);
        install(page, "text/html");
        const response = await HttpClient.wrapFetch("https://example.com/c", {
            makeTextDecoder: () => new TextDecoder("gbk"),
        });
        expect(response.responseXML.querySelector("p")?.textContent).toBe("中文");
    });

    it("hands a non-HTML body its bytes without fetching it twice", async () => {
        const fetchMock = install(new TextEncoder().encode('{"a":1}'), "application/json");
        const response = await HttpClient.wrapFetch("https://example.com/api");
        expect(new TextDecoder().decode(response.arrayBuffer)).toBe('{"a":1}');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(typeof response.makeTextDecoder).toBe("function");
    });

    it("still refuses a PDF where a page was expected", async () => {
        install(new TextEncoder().encode("%PDF-1.7"), "application/pdf");
        await expect(
            HttpClient.wrapFetch("https://example.com/c.pdf", {
                retry: { retryDelay: [] },
            } as never),
        ).rejects.toThrow(/application\/pdf/);
    });
});
