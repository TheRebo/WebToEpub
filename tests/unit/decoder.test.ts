import { describe, expect, it, vi } from "vitest";
import { FetchClient, decoderFor } from "../../src/core/net/fetch-client";

/** "中文" in GBK. */
const GBK = [0xd6, 0xd0, 0xce, 0xc4];

function page(head: string, contentType: string): Response {
    const bytes = new Uint8Array([
        ...new TextEncoder().encode(`<html><head>${head}</head><body><p>`),
        ...GBK,
        ...new TextEncoder().encode("</p></body></html>"),
    ]);
    return new Response(bytes, { status: 200, headers: { "content-type": contentType } });
}

describe("the page decoder", () => {
    it("uses the charset the Content-Type names", async () => {
        const client = new FetchClient({
            fetch: vi.fn(async () => page("", "text/html; charset=gbk")) as never,
            sleep: async () => {},
        });
        const result = await client.fetchHtml("https://example.com/");
        expect(result.dom.querySelector("p")?.textContent).toBe("中文");
    });

    it("falls back to the page's own meta charset", async () => {
        const client = new FetchClient({
            fetch: vi.fn(async () => page('<meta charset="gbk">', "text/html")) as never,
            sleep: async () => {},
        });
        const result = await client.fetchHtml("https://example.com/");
        expect(result.dom.querySelector("p")?.textContent).toBe("中文");
    });

    it("lets a parser supply its own decoder", async () => {
        const client = new FetchClient({
            fetch: vi.fn(async () => page("", "text/html; charset=utf-8")) as never,
            sleep: async () => {},
        });
        const result = await client.fetchHtml("https://example.com/", {
            decoder: () => new TextDecoder("gbk"),
        });
        expect(result.dom.querySelector("p")?.textContent).toBe("中文");
    });

    it("falls back to UTF-8 for an encoding it does not know", () => {
        const response = new Response("", {
            headers: { "content-type": "text/html; charset=nope" },
        });
        expect(decoderFor(response, new Uint8Array()).encoding).toBe("utf-8");
    });
});
