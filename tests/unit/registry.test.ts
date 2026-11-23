import { beforeEach, describe, expect, it } from "vitest";
import {
    ParserRegistry,
    extractHostName,
    hostNameForParserSelection,
    isWebArchive,
    stripLeadingWww,
    stripWebArchive,
} from "../../src/core/parsers/registry";
import type { ParserServices } from "../../src/core/parsers/parser";
import { Parser } from "../../src/core/parsers/parser";
import { setParserServices } from "../../src/core/parsers/services-context";

/** A parser that does nothing, for registration tests. */
class StubParser extends Parser {
    constructor(services: ParserServices) {
        super(services);
    }
    getChapterUrls(): never[] {
        return [];
    }
    findContent(): null {
        return null;
    }
}

const services: ParserServices = {
    fetchHtml: async () => ({ dom: new DOMParser().parseFromString("", "text/html"), url: "" }),
    fetchJson: async () => ({ json: null }),
    util: {} as ParserServices["util"],
    imageCollector: { images: new Map(), addImage: async () => undefined },
};

describe("the parser registry", () => {
    let registry: ParserRegistry;

    beforeEach(() => {
        setParserServices(services);
        registry = new ParserRegistry();
    });

    it("selects a parser by an exact host", () => {
        registry.register("example.com", (s) => new StubParser(s));
        const parser = registry.fetchByUrl("https://example.com/story");
        expect(parser).toBeInstanceOf(StubParser);
    });

    it("ignores a leading www when matching", () => {
        registry.register("example.com", (s) => new StubParser(s));
        expect(registry.fetchByUrl("https://www.example.com/story")).toBeInstanceOf(StubParser);
    });

    it("refuses to register the same host twice", () => {
        registry.register("example.com", (s) => new StubParser(s));
        expect(() => registry.register("example.com", (s) => new StubParser(s))).toThrow(
            /Duplicate parser/,
        );
    });

    it("lets a registration be replaced deliberately", () => {
        registry.register("example.com", (s) => new StubParser(s));
        expect(() => registry.reregister("example.com", (s) => new StubParser(s))).not.toThrow();
    });

    it("returns null when no host or URL rule matches", () => {
        expect(registry.fetchByUrl("https://unknown.example/story")).toBeNull();
    });

    it("falls back to the default parser", () => {
        registry.registerDefault((s) => new StubParser(s));
        const dom = new DOMParser().parseFromString("", "text/html");
        expect(registry.fetch("https://unknown.example/story", dom)).toBeInstanceOf(StubParser);
    });

    it("prefers an exact host over a URL rule", () => {
        class Exact extends StubParser {}
        class Rule extends StubParser {}
        registry.register("example.com", (s) => new Exact(s));
        registry.registerUrlRule(() => true, (s) => new Rule(s));
        expect(registry.fetchByUrl("https://example.com/story")).toBeInstanceOf(Exact);
    });

    it("uses the first URL rule that matches", () => {
        class First extends StubParser {}
        class Second extends StubParser {}
        registry.registerUrlRule((url) => url.includes("/first"), (s) => new First(s));
        registry.registerUrlRule(() => true, (s) => new Second(s));
        expect(registry.fetchByUrl("https://example.com/first")).toBeInstanceOf(First);
    });

    it("takes the confidence rule with the highest confidence", () => {
        class Low extends StubParser {}
        class High extends StubParser {}
        registry.registerRule(() => 0.2, (s) => new Low(s));
        registry.registerRule(() => 0.9, (s) => new High(s));
        const dom = new DOMParser().parseFromString("", "text/html");
        expect(registry.fetch("https://example.com/story", dom)).toBeInstanceOf(High);
    });

    it("ignores a confidence rule that reports zero", () => {
        class Never extends StubParser {}
        registry.registerRule(() => 0, (s) => new Never(s));
        registry.registerDefault((s) => new StubParser(s));
        const dom = new DOMParser().parseFromString("", "text/html");
        expect(registry.fetch("https://example.com/story", dom)).not.toBeInstanceOf(Never);
    });

    it("finds a parser the user selected by hand", () => {
        registry.registerManualSelect("My site", (s) => new StubParser(s));
        expect(registry.manuallySelectParser("My site")).toBeInstanceOf(StubParser);
        expect(registry.manuallySelectParser("Other site")).toBeNull();
    });

    it("lists the registered host names in a stable order", () => {
        registry.register("b.example", (s) => new StubParser(s));
        registry.register("a.example", (s) => new StubParser(s));
        expect(registry.registeredHosts).toEqual(["a.example", "b.example"]);
        expect(registry.size).toBe(2);
    });
});

describe("host name helpers", () => {
    it("extracts a host name", () => {
        expect(extractHostName("https://Example.com/story")).toBe("example.com");
        expect(extractHostName("not a url")).toBe("");
    });

    it("strips a leading www", () => {
        expect(stripLeadingWww("www.example.com")).toBe("example.com");
        expect(stripLeadingWww("example.com")).toBe("example.com");
    });

    it("recognises the Internet Archive", () => {
        expect(isWebArchive("https://web.archive.org/web/2020/story")).toBe(true);
        expect(isWebArchive("https://example.com/story")).toBe(false);
    });

    it("unwraps an Internet Archive URL for parser selection", () => {
        expect(stripWebArchive("https://web.archive.org/web/2020/https://example.com/story")).toBe(
            "https://example.com/story",
        );
        expect(hostNameForParserSelection("https://web.archive.org/web/2020/https://example.com/x")).toBe(
            "example.com",
        );
    });
});
