import { describe, expect, it } from "vitest";
import { Parser, type ParserServices } from "../../src/core/parsers/parser";

/**
 * A parser whose content lives in `<div id="content">`, used to check that a
 * chapter split across several pages comes back whole.
 */
class PagedParser extends Parser {
    getChapterUrls(): never[] {
        return [];
    }

    findContent(dom: Document): Element | null {
        return dom.querySelector("#content");
    }
}

/** A service that serves one document per URL path. */
function servicesFor(pages: Record<string, string>): ParserServices {
    return {
        fetchHtml: async (url: string) => {
            const html = pages[url];
            if (html === undefined) throw new Error(`Unexpected URL: ${url}`);
            return {
                dom: new DOMParser().parseFromString(html, "text/html"),
                url,
            };
        },
        fetchJson: async () => ({ json: null }),
        util: {
            moveChildElements: (source: Element, target: Element) => {
                while (source.firstChild) target.appendChild(source.firstChild);
            },
        } as ParserServices["util"],
        imageCollector: { images: new Map(), addImage: async () => undefined },
    };
}

describe("the parser's table-of-contents helpers", () => {
    it("collects the chapters from every page of a paginated list", async () => {
        const services = servicesFor({
            "/toc/1": `<ul><li><a href="/c/1">One</a></li></ul>
                <a class="next" href="/toc/2">Next</a>`,
            "/toc/2": `<ul><li><a href="/c/2">Two</a></li></ul>`,
        });
        const parser = new PagedParser(services);

        const chapters = await parser.walkTocPages(
            (await services.fetchHtml("/toc/1")).dom,
            (dom) =>
                Array.from(dom.querySelectorAll("ul a")).map((a) => ({
                    sourceUrl: (a as HTMLAnchorElement).getAttribute("href") ?? "",
                    title: a.textContent ?? "",
                })),
            (dom) => dom.querySelector<HTMLAnchorElement>("a.next")?.getAttribute("href") ?? null,
        );

        expect(chapters.map((chapter) => chapter.title)).toEqual(["One", "Two"]);
    });

    it("stops walking when a site loops forever", async () => {
        const services = servicesFor({
            "/toc/1": `<a class="next" href="/toc/1">Next</a>`,
        });
        const parser = new PagedParser(services);

        const chapters = await parser.walkTocPages(
            (await services.fetchHtml("/toc/1")).dom,
            () => [],
            (dom) => dom.querySelector<HTMLAnchorElement>("a.next")?.getAttribute("href") ?? null,
        );

        // The guard stops the walk; it does not throw.
        expect(chapters).toEqual([]);
    });
});

describe("the parser's cover image", () => {
    /** A parser that finds the content in `<div id="content">`. */
    class CoverParser extends Parser {
        getChapterUrls(): never[] {
            return [];
        }

        findContent(dom: Document): Element | null {
            return dom.querySelector("#content");
        }
    }

    /**
     * Build a document served from an address.
     *
     * The base address matters: it is what a relative image URL is resolved
     * against.
     */
    function documentServedFrom(url: string, html: string): Document {
        const dom = new DOMParser().parseFromString(html, "text/html");
        const base = dom.createElement("base");
        base.setAttribute("href", url);
        dom.head?.prepend(base);
        return dom;
    }

    it("is the image the page names for itself", () => {
        // The page says what its cover is. That statement is better than a
        // guess, and it is what a reader would call the cover.
        const dom = documentServedFrom(
            "https://example.com/story",
            `<html><head>
                <meta property="og:image" content="https://example.com/cover.jpg">
            </head><body>
                <div id="content"><img src="advert.png"></div>
            </body></html>`,
        );

        expect(new CoverParser(servicesFor({})).findCoverImageUrl(dom)).toBe(
            "https://example.com/cover.jpg",
        );
    });

    it("falls back to the first image in the content", () => {
        const dom = documentServedFrom(
            "https://example.com/story",
            "<html><body><div id='content'><img src='cover.png'></div></body></html>",
        );

        expect(new CoverParser(servicesFor({})).findCoverImageUrl(dom)).toBe(
            "https://example.com/cover.png",
        );
    });

    it("resolves a relative cover against the page's own address", () => {
        const dom = documentServedFrom(
            "https://example.com/story/1",
            "<html><body><div id='content'><img src='cover.png'></div></body></html>",
        );

        expect(new CoverParser(servicesFor({})).findCoverImageUrl(dom)).toBe(
            "https://example.com/story/cover.png",
        );
    });

    it("is nothing when the page has no image at all", () => {
        const dom = documentServedFrom(
            "https://example.com/story",
            "<html><body><div id='content'><p>Prose.</p></div></body></html>",
        );

        expect(new CoverParser(servicesFor({})).findCoverImageUrl(dom)).toBeNull();
    });
});

describe("the parser's multi-page chapter helper", () => {
    it("returns the first page with every page's content merged into it", async () => {
        const services = servicesFor({
            "/c/1": `<div id="content"><p>First page</p></div>
                <a class="next" href="/c/2">Next</a>`,
            "/c/2": `<div id="content"><p>Second page</p></div>`,
        });
        const parser = new PagedParser(services);

        const dom = await parser.walkPagesOfChapter(
            "/c/1",
            (page) => page.querySelector<HTMLAnchorElement>("a.next")?.getAttribute("href") ?? null,
        );

        const content = dom.querySelector("#content");
        expect(content).not.toBeNull();
        expect(content?.textContent).toContain("First page");
        expect(content?.textContent).toContain("Second page");
    });

    it("keeps the first page when the chapter is a single page", async () => {
        const services = servicesFor({
            "/c/1": `<div id="content"><p>Only page</p></div>`,
        });
        const parser = new PagedParser(services);

        const dom = await parser.walkPagesOfChapter("/c/1", () => null);

        expect(dom.querySelector("#content")?.textContent).toContain("Only page");
    });

    it("stops walking when a site loops forever", async () => {
        const services = servicesFor({
            "/c/1": `<div id="content"><p>Loop</p></div>
                <a class="next" href="/c/1">Next</a>`,
        });
        const parser = new PagedParser(services);

        const dom = await parser.walkPagesOfChapter(
            "/c/1",
            (page) => page.querySelector<HTMLAnchorElement>("a.next")?.getAttribute("href") ?? null,
        );

        expect(dom.querySelector("#content")?.textContent).toContain("Loop");
    });
});
