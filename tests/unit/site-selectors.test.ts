import { beforeEach, describe, expect, it } from "vitest";
import {
    SiteSelectorStore,
    emptySiteSelectorConfig,
    normaliseHostName,
    validateSiteSelectorConfig,
    type SiteSelectorStorage,
} from "../../src/core/storage/site-selectors-store";
import {
    findContentNode,
    generateSelector,
    isTableOfContents,
    scanDocument,
} from "../../src/core/parsers/heuristic-scanner";
import {
    escapeCssIdentifier,
    isParsableSelector,
    isSyntacticallyPlausible,
} from "../../src/core/util/css";

/** An in-memory stand-in for `browser.storage.local`. */
function memoryStorage(): SiteSelectorStorage & { data: Record<string, unknown> } {
    const data: Record<string, unknown> = {};
    return {
        data,
        async get(keys) {
            const names = typeof keys === "string" ? [keys] : (keys ?? []);
            const result: Record<string, unknown> = {};
            for (const name of names) {
                if (name in data) result[name] = data[name];
            }
            return result;
        },
        async set(items) {
            Object.assign(data, items);
        },
        async remove(keys) {
            for (const name of typeof keys === "string" ? [keys] : keys) delete data[name];
        },
    };
}

/** Parse an HTML fragment into a document. */
function parse(html: string): Document {
    return new DOMParser().parseFromString(html, "text/html");
}

describe("normaliseHostName", () => {
    it("lower-cases the name and drops the www prefix", () => {
        expect(normaliseHostName("WWW.Example.COM")).toBe("example.com");
        expect(normaliseHostName("  Example.com  ")).toBe("example.com");
    });

    it("leaves a name without a www prefix alone", () => {
        expect(normaliseHostName("example.com")).toBe("example.com");
    });
});

describe("validateSiteSelectorConfig", () => {
    it("accepts a usable configuration", () => {
        const config = validateSiteSelectorConfig({
            contentCss: "div.chapter",
            titleCss: "h1",
            removeCss: ".ad",
            testUrl: "https://example.com/1",
        });
        expect(config?.contentCss).toBe("div.chapter");
        expect(config?.titleCss).toBe("h1");
    });

    it("rejects a missing content selector", () => {
        expect(validateSiteSelectorConfig({ contentCss: "" })).toBeNull();
        expect(validateSiteSelectorConfig({})).toBeNull();
    });

    it("rejects a selector the browser cannot parse", () => {
        expect(validateSiteSelectorConfig({ contentCss: "[" })).toBeNull();
        expect(validateSiteSelectorConfig({ contentCss: "div[a=" })).toBeNull();
    });

    it("rejects a value that is not an object", () => {
        expect(validateSiteSelectorConfig("div.chapter")).toBeNull();
        expect(validateSiteSelectorConfig(null)).toBeNull();
        expect(validateSiteSelectorConfig([])).toBeNull();
    });

    it("defaults the optional fields to empty strings", () => {
        const config = validateSiteSelectorConfig({ contentCss: "div.chapter" });
        expect(config?.titleCss).toBe("");
        expect(config?.removeCss).toBe("");
    });
});

describe("SiteSelectorStore", () => {
    let storage: ReturnType<typeof memoryStorage>;
    let store: SiteSelectorStore;

    beforeEach(() => {
        storage = memoryStorage();
        store = new SiteSelectorStore(storage);
    });

    it("saves and reads back a configuration", async () => {
        await store.setForHost("example.com", {
            contentCss: "div.chapter",
            titleCss: "h1",
            removeCss: ".ad",
            testUrl: "https://example.com/1",
        });
        const config = await store.getForHost("example.com");
        expect(config?.contentCss).toBe("div.chapter");
    });

    it("normalises the host name, so www is the same site", async () => {
        await store.setForHost("WWW.Example.com", {
            ...emptySiteSelectorConfig(),
            contentCss: "div.chapter",
        });
        expect(await store.getForHost("example.com")).not.toBeNull();
    });

    it("refuses to save an unusable selector", async () => {
        await expect(
            store.setForHost("example.com", {
                ...emptySiteSelectorConfig(),
                contentCss: "[",
            }),
        ).rejects.toThrow();
    });

    it("ignores an empty host name", async () => {
        await store.setForHost("   ", {
            ...emptySiteSelectorConfig(),
            contentCss: "div.chapter",
        });
        expect((await store.list()).size).toBe(0);
    });

    it("removes a configuration", async () => {
        await store.setForHost("example.com", {
            ...emptySiteSelectorConfig(),
            contentCss: "div.chapter",
        });
        await store.removeForHost("example.com");
        expect(await store.getForHost("example.com")).toBeNull();
    });

    it("exposes the configurations synchronously once hydrated", async () => {
        await store.hydrate();
        await store.setForHost("example.com", {
            ...emptySiteSelectorConfig(),
            contentCss: "div.chapter",
        });
        expect(store.peek("example.com")?.contentCss).toBe("div.chapter");
    });

    it("drops a stored configuration that no longer validates", async () => {
        await store.hydrate();
        storage.data["kintsugi.siteSelectors"] = { "example.com": { contentCss: "[" } };
        await store.hydrate();
        expect((await store.list()).size).toBe(0);
    });
});

describe("the CSS helpers", () => {
    it("rejects an unbalanced bracket", () => {
        expect(isSyntacticallyPlausible("div[a")).toBe(false);
        expect(isSyntacticallyPlausible("div:not(.a")).toBe(false);
        expect(isSyntacticallyPlausible("div[a")).toBe(false);
    });

    it("rejects an unterminated string", () => {
        expect(isSyntacticallyPlausible('div[a="x]')).toBe(false);
    });

    it("rejects an empty selector", () => {
        expect(isSyntacticallyPlausible("   ")).toBe(false);
    });

    it("accepts the ordinary shapes", () => {
        for (const selector of [
            "div.chapter",
            "#chapter",
            "article .entry-content",
            "div:not(.ad)",
            'a[href^="/chapter"]',
        ]) {
            expect(isSyntacticallyPlausible(selector)).toBe(true);
            expect(isParsableSelector(selector)).toBe(true);
        }
    });

    it("escapes an identifier", () => {
        expect(escapeCssIdentifier("a b")).toBe("a\\ b");
    });
});

describe("isTableOfContents", () => {
    it("recognises a page that is mostly links", () => {
        const dom = parse(
            "<body><ul>" +
                Array.from({ length: 20 }, (_, index) => `<li><a href='/c/${index}'>Chapter ${index}</a></li>`).join("") +
                "</ul></body>",
        );
        expect(isTableOfContents(dom)).toBe(true);
    });

    it("recognises a chapter page", () => {
        const dom = parse(
            "<body><h1>Chapter One</h1><div id='c'><p>" +
                "The story goes on and on and on, with plenty of prose in it. ".repeat(20) +
                "</p></div></body>",
        );
        expect(isTableOfContents(dom)).toBe(false);
    });

    it("says no for an empty page", () => {
        expect(isTableOfContents(parse("<body></body>"))).toBe(false);
    });
});

describe("findContentNode", () => {
    it("finds the element that holds the prose", () => {
        const dom = parse(
            "<body><div id='wrap'><div class='chapter-content'><p>one</p><p>two</p><p>three</p></div></div></body>",
        );
        const node = findContentNode(dom);
        expect(node?.className).toBe("chapter-content");
    });

    it("ignores an element that looks like navigation", () => {
        const dom = parse(
            "<body><div class='sidebar'><p>a</p><p>b</p><p>c</p><p>d</p></div>" +
                "<div class='text'><p>a</p><p>b</p><p>c</p><p>d</p></div></body>",
        );
        const node = findContentNode(dom);
        expect(node?.className).toBe("text");
    });
});

describe("generateSelector", () => {
    it("prefers an id", () => {
        const dom = parse("<body><div id='chapter'>x</div></body>");
        expect(generateSelector(dom.querySelector("#chapter") as Element)).toBe("#chapter");
    });

    it("falls back to the classes", () => {
        const dom = parse("<body><div class='a b'>x</div></body>");
        expect(generateSelector(dom.querySelector("div") as Element)).toBe(".a.b");
    });

    it("falls back to the tag name", () => {
        const dom = parse("<body><article>x</article></body>");
        expect(generateSelector(dom.querySelector("article") as Element)).toBe("article");
    });
});

describe("scanDocument", () => {
    it("proposes a content selector for a chapter page", () => {
        const dom = parse(
            "<body><h1>Chapter One</h1><div class='chapter-content'>" +
                "<p>The story goes on and on and on, with plenty of prose in it. ".repeat(20) +
                "</p></div></body>",
        );
        const result = scanDocument(dom);
        expect(result.status).toBe("success");
        expect(result.contentCss).toBe(".chapter-content");
        expect(result.titleCss).toBe("h1");
    });

    it("reports a table of contents instead of guessing", () => {
        const dom = parse(
            "<body><ul>" +
                Array.from({ length: 20 }, (_, index) => `<li><a href='/c/${index}'>Chapter ${index}</a></li>`).join("") +
                "</ul></body>",
        );
        expect(scanDocument(dom).status).toBe("toc_detected");
    });

    it("proposes a selector that the browser can parse", () => {
        const dom = parse(
            "<body><div class='chapter-content'>" +
                "<p>The story goes on and on and on, with plenty of prose in it. ".repeat(20) +
                "</p></div></body>",
        );
        const result = scanDocument(dom);
        expect(() => document.querySelector(result.contentCss)).not.toThrow();
    });
});
