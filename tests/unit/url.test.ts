/**
 * Tests for the URL helpers.
 *
 * The user types an address by hand, so these functions decide what the
 * extension believes the user meant. A mistake here shows up as a confusing
 * network error much later, so the rules are worth pinning down.
 */
import { describe, expect, it } from "vitest";
import { hostNameOf, normaliseStoryUrl, redactUrl } from "../../src/core/util/url";

describe("normaliseStoryUrl", () => {
    it("keeps an address that is already one", () => {
        expect(normaliseStoryUrl("https://example.com/story")).toBe("https://example.com/story");
    });

    it("adds a scheme to one that has none", () => {
        expect(normaliseStoryUrl("example.com/story")).toBe("https://example.com/story");
    });

    it("trims the spaces around it", () => {
        expect(normaliseStoryUrl("  https://example.com/story  ")).toBe(
            "https://example.com/story",
        );
    });

    it("keeps a scheme that is already there", () => {
        expect(normaliseStoryUrl("http://example.com/story")).toBe("http://example.com/story");
    });

    it("refuses nothing at all", () => {
        expect(normaliseStoryUrl("")).toBeUndefined();
        expect(normaliseStoryUrl("   ")).toBeUndefined();
    });

    it("refuses a scheme that is not a web address", () => {
        expect(normaliseStoryUrl("file:///etc/passwd")).toBeUndefined();
        expect(normaliseStoryUrl("ftp://example.com/file")).toBeUndefined();
    });

    it("refuses something that is not an address", () => {
        expect(normaliseStoryUrl("not a url")).toBeUndefined();
    });
});

describe("hostNameOf", () => {
    it("gives the host of an address", () => {
        expect(hostNameOf("https://example.com/story/1")).toBe("example.com");
    });

    it("leaves out the leading www, which nobody types", () => {
        expect(hostNameOf("https://www.example.com/story")).toBe("example.com");
    });

    it("gives an empty name for something that is not an address", () => {
        expect(hostNameOf("not a url")).toBe("");
    });
});

describe("redactUrl", () => {
    it("removes the query string and the fragment", () => {
        expect(redactUrl("https://example.com/chapter/1?token=secret&id=42#part")).toBe(
            "https://example.com/chapter/1",
        );
    });

    it("keeps the path", () => {
        expect(redactUrl("https://example.com/novel/chapter-3")).toBe(
            "https://example.com/novel/chapter-3",
        );
    });

    it("returns nothing for a URL that will not parse", () => {
        expect(redactUrl("not a url ?token=secret")).toBeUndefined();
    });

    it("returns nothing when there is no URL", () => {
        expect(redactUrl(undefined)).toBeUndefined();
    });
});
