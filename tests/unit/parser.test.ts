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
