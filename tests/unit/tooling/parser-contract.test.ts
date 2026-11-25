/**
 * The migrated parsers, checked against the contract the runtime relies on.
 *
 * The interesting part is the last one. The runtime asks a parser for its
 * chapter list through `listChapterUrls`, which always supplies a progress
 * reporter. The migrated parsers dereference that reporter without a guard,
 * because the baseline always passed one — so a parser that crashes when the
 * reporter is missing crashes on a real site too. This test is the regression
 * test for that.
 *
 * It is deliberately a contract test and not a behaviour test: the parsers
 * are the baseline's code, they were written against the baseline's runtime,
 * and their behaviour is covered by the baseline's own suite. What matters
 * here is that all of them still *work* under the rewrite's runtime.
 *
 * The parsers are called against a minimal, empty document. A parser that
 * needs a real page will throw on an empty one — that is expected, and not a
 * contract failure. What must never happen is a crash in the argument
 * handling, which is a property of the parser rather than of the document.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { registerAllParsers, registrationCount } from "../../../src/core/parsers/register-all";
import { legacyRegistry } from "../../../src/core/parsers/compat/legacy-factory";
import { setParserServices } from "../../../src/core/parsers/services-context";
import { LegacyParser } from "../../../src/core/parsers/compat/legacy-parser";
import {
    listChapterUrls,
    type ParserServices,
    type TocProgress,
} from "../../../src/core/parsers/parser";

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

/** An empty document: the smallest thing a parser can be handed. */
function stubDom(): Document {
    return new DOMParser().parseFromString("<html><body></body></html>", "text/html");
}

/** A progress reporter that records nothing. */
function stubProgress(): TocProgress {
    return { showTocProgress: () => undefined };
}

/**
 * Whether a failure is about the progress reporter rather than about the
 * document the parser was handed.
 *
 * @param {unknown} error The failure.
 * @returns {boolean} True when the failure is an argument-handling failure.
 */
function isTocProgressFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /showTocProgress|chapterUrlsUI/i.test(message);
}

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

    it("gives every registered host a parser that implements the contract", () => {
        const hosts = legacyRegistry.registeredHosts;
        expect(hosts.length).toBeGreaterThan(400);

        const failures: string[] = [];
        for (const host of hosts) {
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
        }
        expect(failures).toEqual([]);
    });

    it("calls every parser's getChapterUrls without breaking on the progress reporter", async () => {
        // The runtime asks for the chapter list through `listChapterUrls`,
        // which always supplies a reporter. That is the call that has to
        // survive.
        //
        // The bare `getChapterUrls(dom)` call is tried as well, because a
        // migrated parser that recurses into itself — `InkittParser` does —
        // loses the reporter, and a parser that crashes on that path is
        // broken in the same way.
        const failures: string[] = [];
        for (const host of legacyRegistry.registeredHosts) {
            const parser = legacyRegistry.fetchByUrl(`https://${host}/`);
            if (parser === null) continue;

            const calls: Array<[string, () => Promise<unknown> | unknown]> = [
                ["listChapterUrls", () => listChapterUrls(parser, stubDom())],
                ["getChapterUrls", () => parser.getChapterUrls(stubDom(), undefined)],
                [
                    "getChapterUrls(with reporter)",
                    () => parser.getChapterUrls(stubDom(), stubProgress()),
                ],
            ];

            for (const [name, call] of calls) {
                try {
                    await call();
                } catch (error) {
                    if (!isTocProgressFailure(error)) continue;
                    failures.push(
                        `${host} (${name}): ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        }
        expect(failures).toEqual([]);
    });

    it("never lets a parser see a missing progress reporter", async () => {
        // The regression test for the bug that made twenty-nine sites fail
        // with no chapters at all: the runtime passed no reporter, and the
        // parsers dereferenced it.
        //
        // `listChapterUrls` is the runtime's entry point, so a parser reached
        // through it must never see `undefined`.
        const failures: string[] = [];
        for (const host of legacyRegistry.registeredHosts) {
            const parser = legacyRegistry.fetchByUrl(`https://${host}/`);
            if (parser === null) continue;

            let sawReporter = false;
            const reporter: TocProgress = {
                showTocProgress: () => {
                    sawReporter = true;
                },
            };
            try {
                await listChapterUrls(parser, stubDom(), reporter);
            } catch (error) {
                if (!isTocProgressFailure(error)) continue;
                failures.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
            // A parser that reports progress must have been given a reporter
            // that works. This is checked by the call above succeeding; the
            // flag only documents that the reporter was reachable.
            void sawReporter;
        }
        expect(failures).toEqual([]);
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
