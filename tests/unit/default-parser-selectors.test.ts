/**
 * Tests for the default parser's use of the user's saved selectors.
 *
 * The workbench saves the selectors under the host name of the **story**
 * page. The default parser reads them back while it reads the **chapters**,
 * and a site does not always serve its chapters from the same host as its
 * story page — a mirror, a subdomain, a CDN.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultParser } from "../../src/core/parsers/default-parser";
import { siteSelectors } from "../../src/core/storage/site-selectors";
import { setNamespace } from "../../src/core/browser-api";
import type { ParserServices } from "../../src/core/parsers/parser";

/** The store the singleton uses, when it is backed by the fake API. */
const data: Record<string, unknown> = {};

/** The services the default parser needs. */
const SERVICES = {
    fetchHtml: async (url: string) => ({
        dom: new DOMParser().parseFromString("<html></html>", "text/html"),
        url,
    }),
    fetchJson: async () => ({ json: null }),
    util: {},
    imageCollector: { images: new Map(), addImage: async () => undefined },
} as unknown as ParserServices;

/**
 * Build a document that was served from an address.
 *
 * The base address matters: it is what the parser looks the host name up
 * with.
 */
function documentServedFrom(url: string, html: string): Document {
    const dom = new DOMParser().parseFromString(html, "text/html");
    const base = dom.createElement("base");
    base.setAttribute("href", url);
    dom.head?.prepend(base);
    return dom;
}

describe("the default parser's saved selectors", () => {
    beforeEach(async () => {
        for (const key of Object.keys(data)) delete data[key];
        setNamespace({
            runtime: { getURL: (path: string) => `moz-extension://abc/${path}` },
            storage: {
                local: {
                    get: async (keys: string | string[] | null) => {
                        const names = typeof keys === "string" ? [keys] : (keys ?? []);
                        const result: Record<string, unknown> = {};
                        for (const name of names) {
                            if (name in data) result[name] = data[name];
                        }
                        return result;
                    },
                    set: async (items: Record<string, unknown>) => {
                        Object.assign(data, items);
                    },
                    remove: async (keys: string | string[]) => {
                        for (const name of typeof keys === "string" ? [keys] : keys) {
                            delete data[name];
                        }
                    },
                },
            },
        } as never);

        await siteSelectors.hydrate();
        await siteSelectors.setForHost("example.com", {
            contentCss: "div.chapter-body",
            titleCss: "h1.chapter-title",
            removeCss: "",
            testUrl: "https://example.com/story/1",
        });
    });

    afterEach(() => {
        setNamespace(undefined);
    });

    it("uses the selectors saved for the host the chapter came from", () => {
        const parser = new DefaultParser(SERVICES);
        const dom = documentServedFrom(
            "https://example.com/story/1",
            "<html><body><div class='chapter-body'><p>The prose.</p></div></body></html>",
        );

        expect(parser.findContent(dom)?.className).toBe("chapter-body");
    });

    it("uses the selectors saved for the story when the chapters come from another host", () => {
        // The story is on `example.com`, and the user saved the selectors
        // there. The chapters are served from a mirror.
        const parser = new DefaultParser(SERVICES);
        parser.storyUrl = "https://example.com/story";

        const dom = documentServedFrom(
            "https://mirror.example.net/story/1",
            "<html><body><div class='chapter-body'><p>The prose.</p></div></body></html>",
        );

        expect(parser.findContent(dom)?.className).toBe("chapter-body");
    });

    it("does not let one chapter's host decide for the next one", () => {
        // The parser reads the story page first, then a chapter from the
        // story's own host, then one from a mirror. The mirror's host has no
        // saved selectors of its own, so the story's are used for it — but
        // the story's host must not be looked up under the mirror's name.
        const parser = new DefaultParser(SERVICES);
        parser.storyUrl = "https://example.com/story";

        const story = documentServedFrom(
            "https://example.com/story",
            "<html><body><h1 class='chapter-title'>One</h1></body></html>",
        );
        expect(parser.findChapterTitle(story)?.className).toBe("chapter-title");

        const mirror = documentServedFrom(
            "https://mirror.example.net/story/1",
            "<html><body><h1 class='chapter-title'>Two</h1></body></html>",
        );
        expect(parser.findChapterTitle(mirror)?.className).toBe("chapter-title");
    });

    it("falls back to guessing when no selectors are saved for the host", () => {
        const parser = new DefaultParser(SERVICES);
        parser.storyUrl = "https://elsewhere.test/story";

        const dom = documentServedFrom(
            "https://elsewhere.test/story/1",
            "<html><body><article><p>" + "Prose. ".repeat(60) + "</p></article></body></html>",
        );

        // The guessing half of the parser finds the article, because it is
        // one of the shapes it knows.
        expect(parser.findContent(dom)?.tagName).toBe("ARTICLE");
    });
});
