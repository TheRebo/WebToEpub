/**
 * Tests for the migrated default parser's agreement with the rewritten one.
 *
 * The migrated `DefaultParser` looks a site's saved CSS selectors up with
 * `util.extractHostName`, which returns the raw host name — `www.` and all.
 * The store files them under a name with `www.` stripped. If the two
 * disagree, the selectors the user saved are silently ignored on every site
 * that is served on a `www.` host, which is most of them.
 *
 * These tests pin the agreement down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultParserSiteSettings } from "../../src/core/parsers/compat/legacy-default-parser";
import { util } from "../../src/core/parsers/compat/legacy-util";
import { setNamespace } from "../../src/core/browser-api";
import { normaliseHostName } from "../../src/core/storage/site-selectors-store";

/** The store the singleton uses, when it is backed by the fake API. */
const data: Record<string, unknown> = {};

/** A configuration the user might have saved. */
const CONFIG = {
    contentCss: "div.chapter-content",
    titleCss: "h1",
    removeCss: ".advert",
    testUrl: "https://example.com/story/1",
};

beforeEach(() => {
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
                    for (const name of typeof keys === "string" ? [keys] : keys) delete data[name];
                },
            },
        },
    } as never);
});

afterEach(() => {
    setNamespace(undefined);
});

describe("the migrated default parser's host names", () => {
    it("finds a configuration saved for the bare host", async () => {
        const { siteSelectors } = await import("../../src/core/storage/site-selectors");
        await siteSelectors.hydrate();
        await siteSelectors.setForHost("example.com", CONFIG);

        const settings = new DefaultParserSiteSettings();
        const hostName = util.extractHostName("https://example.com/story/1");
        expect(settings.getConfigForSite(hostName)?.contentCss).toBe("div.chapter-content");
    });

    it("finds a configuration saved for a www host", async () => {
        // The migrated parser asks with the raw host name, `www.` and all.
        // The store files it without. They have to meet.
        const { siteSelectors } = await import("../../src/core/storage/site-selectors");
        await siteSelectors.hydrate();
        await siteSelectors.setForHost("www.example.com", CONFIG);

        const settings = new DefaultParserSiteSettings();
        const hostName = util.extractHostName("https://www.example.com/story/1");
        expect(hostName).toBe("www.example.com");
        expect(settings.getConfigForSite(hostName)?.contentCss).toBe("div.chapter-content");
    });

    it("saves and finds under one key", async () => {
        const { siteSelectors } = await import("../../src/core/storage/site-selectors");
        await siteSelectors.hydrate();

        const settings = new DefaultParserSiteSettings();
        settings.saveSiteConfig(
            "www.example.com",
            CONFIG.contentCss,
            CONFIG.titleCss,
            CONFIG.removeCss,
            CONFIG.testUrl,
        );

        // The in-memory copy and the store have to agree.
        expect(settings.getConfigForSite("www.example.com")).toBeDefined();
        expect(settings.getConfigForSite("example.com")).toBeDefined();

        // The write is deliberately not awaited by the caller — the migrated
        // parser has to keep going — so the test waits for it.
        await vi.waitFor(async () => {
            expect(await siteSelectors.getForHost("example.com")).not.toBeNull();
        });
    });

    it("uses the store's key for the in-memory copy", () => {
        const settings = new DefaultParserSiteSettings();
        settings.saveSiteConfig(
            "WWW.Example.com",
            CONFIG.contentCss,
            CONFIG.titleCss,
            CONFIG.removeCss,
            CONFIG.testUrl,
        );
        expect([...settings.configs.keys()]).toEqual(["example.com"]);
    });

    it("agrees with the rewritten default parser", () => {
        // The rewritten parser asks with the store's own rule. The migrated
        // one has to produce the same key from the same URL.
        const url = "https://www.example.com/story/1";
        const rewrittenKey = normaliseHostName(new URL(url).hostname);
        const migratedKey = normaliseHostName(util.extractHostName(url));
        expect(migratedKey).toBe(rewrittenKey);
    });
});
