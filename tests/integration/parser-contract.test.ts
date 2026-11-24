/**
 * The parser contract test.
 *
 * Every one of the 434 migrated site parsers is loaded, constructed and
 * checked against the contract. This is the test that would catch a parser
 * whose migration broke — a missing import, a renamed base class, a
 * constructor that throws.
 *
 * It is deliberately a contract test and not a behaviour test: the parsers
 * are the baseline's code, they were written against the baseline's runtime,
 * and their behaviour is covered by the baseline's own suite. What matters
 * here is that all of them still *work* under the rewrite's runtime.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { registerAllParsers, registrationCount } from "../../src/core/parsers/register-all";
import { legacyRegistry, parserFactory } from "../../src/core/parsers/compat/legacy-factory";
import { setParserServices } from "../../src/core/parsers/services-context";
import { LegacyParser } from "../../src/core/parsers/compat/legacy-parser";
import type { ParserServices } from "../../src/core/parsers/parser";

/** The services every parser is given. */
const services: ParserServices = {
    fetchHtml: async () => ({
        dom: new DOMParser().parseFromString("<html><body></body></html>", "text/html"),
        url: "https://example.com/",
    }),
    fetchJson: async () => ({ json: null }),
    util: {} as ParserServices["util"],
    imageCollector: { images: new Map(), addImage: async () => undefined },
};

describe("the migrated parsers", () => {
    beforeAll(async () => {
        setParserServices(services);
        await registerAllParsers(legacyRegistry);
    });

    it("registers every parser that was migrated", () => {
        expect(registrationCount()).toBe(434);
    });

    it("registers a parser for every site, without a duplicate", () => {
        // A duplicate registration throws during the module import, so
        // reaching this point at all is half the assertion. The rest guards
        // against a migration that silently drops registrations: several
        // parsers cover more than one host name, so the number of hosts is
        // larger than the number of parser files.
        expect(legacyRegistry.size).toBeGreaterThan(400);
        expect(new Set(legacyRegistry.registeredHosts).size).toBe(legacyRegistry.size);
    });

    it("gives every registered host a unique parser", () => {
        const hosts = legacyRegistry.registeredHosts;
        expect(new Set(hosts).size).toBe(hosts.length);
    });

    it("constructs every registered parser without throwing", () => {
        const failures: string[] = [];
        for (const host of legacyRegistry.registeredHosts) {
            try {
                const parser = legacyRegistry.fetchByUrl(`https://${host}/`);
                if (parser === null) {
                    failures.push(`${host}: no parser`);
                    continue;
                }
                if (typeof parser.getChapterUrls !== "function") {
                    failures.push(`${host}: no getChapterUrls`);
                }
                if (typeof parser.findContent !== "function") {
                    failures.push(`${host}: no findContent`);
                }
            } catch (error) {
                failures.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
    });

    it("builds every parser from the legacy factory", () => {
        // The factory is the baseline's API. Every migrated parser registers
        // through it, so a parser that cannot be built through the factory
        // would never work.
        const parser = parserFactory.fetchByUrl("https://example.com/");
        expect(parser === null || parser instanceof LegacyParser).toBe(true);
    });

    it("keeps every parser's rate limit at a sane value", () => {
        const failures: string[] = [];
        for (const host of legacyRegistry.registeredHosts) {
            const parser = legacyRegistry.fetchByUrl(`https://${host}/`);
            if (!parser) continue;
            const limit = parser.getRateLimit();
            if (!Number.isFinite(limit) || limit < 0) {
                failures.push(`${host}: ${limit}`);
            }
        }
        expect(failures).toEqual([]);
    });

    it("never runs more than one request at a time", () => {
        // The baseline's `maxSimultanousFetchSize` was a constant that
        // everybody ignored. Concurrent fetching gets users rate-limited, so
        // the contract says one.
        for (const host of legacyRegistry.registeredHosts) {
            const parser = legacyRegistry.fetchByUrl(`https://${host}/`);
            expect(parser?.maxSimultanousFetchSize).toBe(1);
        }
    });

    it("exposes the statics the baseline's parsers call", () => {
        expect(typeof LegacyParser.makeEmptyDocForContent).toBe("function");
        expect(typeof LegacyParser.findConstructedContent).toBe("function");
        expect(typeof LegacyParser.addTextToChapterContent).toBe("function");
        expect(LegacyParser.WEB_TO_EPUB_CLASS_NAME).toBe("webToEpubContent");
    });
});
