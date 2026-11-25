/**
 * The legacy parser factory.
 *
 * The baseline's `ParserFactory` was a global that every parser registered
 * itself with, at load time. The rewrite has a `ParserRegistry` that the
 * background worker owns.
 *
 * This module is the bridge. It presents the baseline's API — `register`,
 * `reregister`, `registerUrlRule`, `registerRule`, `registerManualSelect`,
 * `fetchByUrl`, `fetch` — and forwards it to the rewrite's registry, which
 * already implements the baseline's selection order:
 *
 *  1. an exact host match;
 *  2. a URL rule, in registration order;
 *  3. a confidence rule, taking the highest confidence;
 *  4. the default parser.
 *
 * The one thing the baseline's factory did that the rewrite's registry does
 * not is pass the URL to the constructor. The rewrite's constructors take
 * their services instead, and the parsers that need the URL already have it.
 *
 * See ADR-0002.
 */

"use strict";

import { ParserRegistry, type ParserConstructor } from "../registry";
import type { Parser } from "../parser";
import { HttpClient } from "./legacy-http-client";
import type { LegacyChapter, LegacyParser } from "./legacy-parser";

/**
 * A legacy registration.
 *
 * The baseline's registrations were thunks — `() => new XParser()` — because
 * the baseline's factory called them with a URL they ignored. The rewrite's
 * registry wants a function that takes the services. This is the translation.
 */
type LegacyConstructor = (url?: string) => Parser;

/** The registry the legacy factory writes to. */
export const legacyRegistry = new ParserRegistry();

/** Translate a legacy constructor into a registry constructor. */
function toRegistryConstructor(constructor: LegacyConstructor): ParserConstructor {
    return () => constructor();
}

/**
 * The legacy parser factory.
 */
export class LegacyParserFactory {
    /** The registry the registrations go to. */
    registry: ParserRegistry;

    constructor(registry: ParserRegistry = legacyRegistry) {
        this.registry = registry;
    }

    /**
     * Register a parser for a host name.
     *
     * @throws When a parser is already registered for the host, which is
     *   what the baseline did.
     */
    register(hostName: string, constructor: LegacyConstructor): void {
        this.registry.register(hostName, toRegistryConstructor(constructor));
    }

    /** Register a parser for a site that is known to be dead. */
    registerDeadSite(hostName: string, constructor: LegacyConstructor): void {
        this.registry.registerDeadSite(hostName, toRegistryConstructor(constructor));
    }

    /** Replace an existing registration. */
    reregister(hostName: string, constructor: LegacyConstructor): void {
        this.registry.reregister(hostName, toRegistryConstructor(constructor));
    }

    /**
     * Register a rule that tests the URL alone.
     *
     * The rules keep their registration order, because the baseline's did.
     */
    registerUrlRule(
        test: (url: string) => boolean,
        constructor: LegacyConstructor,
        name?: string,
    ): void {
        this.registry.registerUrlRule(test, toRegistryConstructor(constructor), name);
    }

    /**
     * Register a rule that tests the URL and the page's DOM, and reports a
     * confidence.
     */
    registerRule(
        test: (url: string, dom: Document) => number,
        constructor: LegacyConstructor,
        name?: string,
    ): void {
        this.registry.registerRule(test, toRegistryConstructor(constructor), name);
    }

    /** Register a parser the user can select by hand. */
    registerManualSelect(name: string, constructor: LegacyConstructor): void {
        this.registry.registerManualSelect(name, toRegistryConstructor(constructor));
    }

    /** The parser for a URL, without looking at the DOM. */
    fetchByUrl(url: string): Parser | null {
        return this.registry.fetchByUrl(url);
    }

    /** The parser for a URL and a DOM, falling back to the default parser. */
    fetch(url: string, dom: Document): Parser | null {
        return this.registry.fetch(url, dom);
    }

    /** The parser the user selected by name. */
    manuallySelectParser(name: string): Parser | null {
        return this.registry.manuallySelectParser(name);
    }

    /** The parsers the user can select by hand. */
    get manualSelection(): readonly { name: string; constructor: ParserConstructor }[] {
        return this.registry.manualParsers;
    }

    /**
     * Give every chapter the parser that will fetch it.
     *
     * A story's chapters usually live on the same host as its table of
     * contents, but not always: a table of contents on one site can link to
     * chapters on another. Each host gets its own parser, and the state is
     * copied from the first one so that the user preferences travel with it.
     */
    async addParsersToPages(initialParser: LegacyParser, webPages: LegacyChapter[]): Promise<void> {
        const pagesByHost = new Map<string, LegacyChapter[]>();
        const initialUrl = initialParser.state.chapterListUrl ?? "";
        const initialHostName = hostNameForParserSelection(initialUrl);

        for (const page of webPages) {
            const key = hostNameForParserSelection(page.sourceUrl);
            if (key === initialHostName) {
                page.parser = initialParser;
                continue;
            }
            const pages = pagesByHost.get(key);
            if (pages === undefined) {
                pagesByHost.set(key, [page]);
            } else {
                pages.push(page);
            }
        }

        for (const pages of pagesByHost.values()) {
            await this.assignParserToPages(pages, initialParser);
        }
    }

    /** Give a group of chapters the parser that will fetch them. */
    async assignParserToPages(
        webPages: LegacyChapter[],
        initialParser: LegacyParser,
    ): Promise<void> {
        const url = webPages[0]?.sourceUrl ?? "";
        if (url === "") return;
        let parser = this.fetchByUrl(url);
        if (parser === null) {
            const responseXML = (await HttpClient.wrapFetch(url)).responseXML;
            parser = this.fetch(url, responseXML);
        }

        // When no parser can be found for the group, the parser that listed
        // the chapters is the one that fetches them. Leaving the chapters
        // without a parser would mean they were fetched by whatever parser
        // happened to be running, which is rarely the right one.
        const legacyParser = (parser as LegacyParser | null) ?? initialParser;

        if (typeof legacyParser.copyState === "function") {
            legacyParser.copyState(initialParser);
        }
        for (const page of webPages) {
            page.parser = legacyParser;
        }
    }
}

/**
 * The host name used to select a parser.
 *
 * The baseline stripped a leading `www.` and unwrapped the Internet
 * Archive's URL form, so that `https://www.example.com` and
 * `https://example.com` reach the same parser.
 */
export function hostNameForParserSelection(url: string): string {
    let working = url;
    if (isWebArchive(url)) working = stripWebArchive(url);
    return stripLeadingWww(utilExtractHostName(working));
}

/** Whether the URL points at the Internet Archive's web archive. */
export function isWebArchive(url: string): boolean {
    const host = utilExtractHostName(url);
    return host.startsWith("web.archive.org") || host.startsWith("web-beta.archive.org");
}

/** Strip the Internet Archive's wrapper from a URL. */
export function stripWebArchive(url: string): string {
    const parts = url.split("://");
    return parts[2] ? `https://${parts[2]}` : url;
}

/** Strip a leading `www.` from a host name. */
export function stripLeadingWww(hostName: string): string {
    return hostName.startsWith("www.") ? hostName.substring(4) : hostName;
}

/** The host name of a URL. */
function utilExtractHostName(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        const match = /^(?:[a-z]+:)?\/\/([^/:?#]+)/i.exec(url);
        return match?.[1]?.toLowerCase() ?? "";
    }
}

/** The legacy factory. */
export const parserFactory = new LegacyParserFactory();
