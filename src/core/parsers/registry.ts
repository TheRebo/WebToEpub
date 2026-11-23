/**
 * The parser registry.
 *
 * Selects the parser for a URL, in the same order the baseline did:
 *
 *  1. An exact host match.
 *  2. A URL rule (a predicate on the URL alone).
 *  3. A confidence rule (a predicate on the URL *and* the DOM), taking the
 *     highest confidence.
 *  4. The default parser.
 *
 * The registry is the one place that knows about all 437 parsers, so the
 * popup and the options page never need to load parser code at all.
 *
 * See ADR-0002.
 */
import type { Parser } from "./parser";

/** A parser constructor. */
export type ParserConstructor = (services: never) => Parser;

/** A rule that tests a URL alone. */
export interface UrlRule {
    /** The predicate. */
    test: (url: string) => boolean;
    /** The parser to use. */
    constructor: ParserConstructor;
    /** A name, for the UI. */
    name?: string;
}

/** A rule that tests a URL and the page's DOM, and reports a confidence. */
export interface ConfidenceRule {
    /**
     * The predicate.
     *
     * Returns a confidence between 0 and 1. Zero means "not me".
     */
    test: (url: string, dom: Document) => number;
    /** The parser to use. */
    constructor: ParserConstructor;
    /** A name, for the UI. */
    name?: string;
}

/** A parser the user can choose by hand. */
export interface ManualParser {
    /** The name shown in the UI. */
    name: string;
    /** The parser. */
    constructor: ParserConstructor;
}

/** The registry. */
export class ParserRegistry {
    #parsers = new Map<string, ParserConstructor>();
    #urlRules: UrlRule[] = [];
    #confidenceRules: ConfidenceRule[] = [];
    #manual: ManualParser[] = [];
    #defaultConstructor: ParserConstructor | undefined;

    /** Register a parser for an exact host. */
    register(hostName: string, constructor: ParserConstructor): void {
        const key = stripLeadingWww(hostName);
        if (this.#parsers.has(key)) {
            throw new Error(`Duplicate parser registered for host name ${hostName}`);
        }
        this.#parsers.set(key, constructor);
    }

    /** Register a parser for a site that is known to be dead. */
    registerDeadSite(hostName: string, constructor: ParserConstructor): void {
        this.register(hostName, constructor);
    }

    /** Replace an existing registration. */
    reregister(hostName: string, constructor: ParserConstructor): void {
        this.#parsers.set(stripLeadingWww(hostName), constructor);
    }

    /** Register a URL rule. */
    registerUrlRule(test: (url: string) => boolean, constructor: ParserConstructor, name?: string): void {
        this.#urlRules.push({ test, constructor, name });
    }

    /** Register a confidence rule. */
    registerRule(
        test: (url: string, dom: Document) => number,
        constructor: ParserConstructor,
        name?: string,
    ): void {
        this.#confidenceRules.push({ test, constructor, name });
    }

    /** Register a parser the user can select by hand. */
    registerManualSelect(name: string, constructor: ParserConstructor): void {
        this.#manual.push({ name, constructor });
    }

    /** Register the fallback parser. */
    registerDefault(constructor: ParserConstructor): void {
        this.#defaultConstructor = constructor;
    }

    /** The host names that have a dedicated parser. */
    get registeredHosts(): string[] {
        return [...this.#parsers.keys()].sort();
    }

    /** The parsers the user can select by hand. */
    get manualParsers(): readonly ManualParser[] {
        return this.#manual;
    }

    /** The number of registered parsers. */
    get size(): number {
        return this.#parsers.size;
    }

    /**
     * The parser for a URL, without looking at the DOM.
     *
     * Returns `null` when no exact host or URL rule matches, so the caller
     * can decide whether to look at the DOM.
     */
    fetchByUrl(url: string): Parser | null {
        const hostName = hostNameForParserSelection(url);
        const constructor = this.#parsers.get(hostName);
        if (constructor) return this.#construct(constructor);

        for (const rule of this.#urlRules) {
            if (rule.test(url)) return this.#construct(rule.constructor);
        }
        return null;
    }

    /**
     * The parser for a URL and a DOM.
     *
     * Falls back to the default parser when nothing matches.
     */
    fetch(url: string, dom: Document): Parser | null {
        const exact = this.fetchByUrl(url);
        if (exact) return exact;

        let maxConfidence = 0;
        let best: ParserConstructor | undefined;
        for (const rule of this.#confidenceRules) {
            const confidence = rule.test(url, dom);
            if (maxConfidence < confidence) {
                maxConfidence = confidence;
                best = rule.constructor;
            }
        }
        if (best && maxConfidence > 0) return this.#construct(best);

        return this.#defaultConstructor ? this.#construct(this.#defaultConstructor) : null;
    }

    /** The parser the user selected by name. */
    manuallySelectParser(name: string): Parser | null {
        const entry = this.#manual.find((m) => m.name === name);
        return entry ? this.#construct(entry.constructor) : null;
    }

    /** Instantiate a parser. */
    #construct(constructor: ParserConstructor): Parser {
        // The constructor signature takes services; the registry injects
        // them at call time through the active context.
        return (constructor as unknown as (services: unknown) => Parser)(
            getParserServices(),
        );
    }
}

/**
 * The services the registry injects into a parser.
 *
 * Set once at startup by the background worker. The registry is
 * constructed before the services exist, so this indirection avoids
 * threading the services through every registration.
 */
let parserServices: unknown;

/** Set the services the registry injects. */
export function setParserServices(services: unknown): void {
    parserServices = services;
}

/** The services the registry injects. */
function getParserServices(): unknown {
    if (parserServices === undefined) {
        throw new Error("Parser services have not been set. Call setParserServices() first.");
    }
    return parserServices;
}

/** The host name used for parser selection. */
export function hostNameForParserSelection(url: string): string {
    let working = url;
    if (isWebArchive(url)) working = stripWebArchive(url);
    return stripLeadingWww(extractHostName(working));
}

/** Whether the URL points at the Internet Archive's web archive. */
export function isWebArchive(url: string): boolean {
    const host = extractHostName(url);
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

/** The host name of a URL, or an empty string. */
export function extractHostName(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        // A URL that will not parse: try a loose extraction.
        const match = /^(?:[a-z]+:)?\/\/([^/:?#]+)/i.exec(url);
        return match?.[1]?.toLowerCase() ?? "";
    }
}
