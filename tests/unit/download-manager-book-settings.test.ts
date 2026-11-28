/**
 * The book settings.
 *
 * The options page offers a choice of EPUB version, a switch for the
 * information page and a default language. None of them reached the book:
 * the version was hard-coded to 3, the information page was never written,
 * and a site that did not declare a language produced a book with no
 * language at all.
 *
 * These tests pin down the behaviour that the settings now control.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BOOK,
    buildBookMetadata,
    type DownloadBook,
} from "../../src/core/download-manager";
import type { Parser } from "../../src/core/parsers/parser";
import type { ImageData } from "../../src/core/epub/packer";

/** A parser that knows nothing about the story. */
const BLANK_PARSER = {
    extractAuthor: () => "",
    extractLanguage: () => "",
    extractPublisher: () => "",
    extractDescription: () => "",
    extractSubject: () => "",
    extractDatePublished: () => "",
    findCoverImageUrl: () => null,
} as unknown as Parser;

/** A parser that says the story is in French. */
const FRENCH_PARSER = {
    ...BLANK_PARSER,
    extractLanguage: () => "fr",
} as unknown as Parser;

/** The story's page. */
function storyPage(): Document {
    return new DOMParser().parseFromString(
        "<html><body><h1>The Story</h1></body></html>",
        "text/html",
    );
}

/** The book settings, with the given changes. */
function bookSettings(changes: Partial<DownloadBook> = {}): DownloadBook {
    return { ...DEFAULT_BOOK, ...changes };
}

describe("the EPUB version", () => {
    it("is the version the user asked for", () => {
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            storyPage(),
            BLANK_PARSER,
            new Map(),
            bookSettings({ version: 2 }),
        );
        expect(metadata.version).toBe(2);
    });

    it("is EPUB 3 when nothing else is known", () => {
        expect(DEFAULT_BOOK.version).toBe(3);
    });
});

describe("the information page", () => {
    it("is in the book when the user asked for it", () => {
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            storyPage(),
            BLANK_PARSER,
            new Map(),
            bookSettings({ addInfoPage: true }),
        );
        expect(metadata.includeInfoPage).toBe(true);
    });

    it("is left out when the user did not ask for it", () => {
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            storyPage(),
            BLANK_PARSER,
            new Map(),
            bookSettings({ addInfoPage: false }),
        );
        expect(metadata.includeInfoPage).toBe(false);
    });
});

describe("the book's language", () => {
    it("is the language the site declares", () => {
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            storyPage(),
            FRENCH_PARSER,
            new Map(),
            bookSettings({ defaultLanguage: "en" }),
        );
        expect(metadata.language).toBe("fr");
    });

    it("is the user's default when the site says nothing", () => {
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            storyPage(),
            BLANK_PARSER,
            new Map(),
            bookSettings({ defaultLanguage: "de" }),
        );
        expect(metadata.language).toBe("de");
    });

    it("is the user's default when there is no parser at all", () => {
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            null,
            null,
            new Map(),
            bookSettings({ defaultLanguage: "ja" }),
        );
        expect(metadata.language).toBe("ja");
    });
});

describe("the cover", () => {
    it("is the image the parser named, when it was downloaded", () => {
        const cover: ImageData = {
            data: new Uint8Array([1]),
            mediaType: "image/png",
            url: "https://example.com/cover.png",
        };
        const parser = {
            ...BLANK_PARSER,
            findCoverImageUrl: () => "https://example.com/cover.png",
        } as unknown as Parser;
        const metadata = buildBookMetadata(
            "A Story",
            "https://example.com/story",
            storyPage(),
            parser,
            new Map([["https://example.com/cover.png", cover]]),
            bookSettings(),
        );
        expect(metadata.cover).toBe(cover);
    });
});
