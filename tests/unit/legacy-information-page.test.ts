/**
 * The information page and the description of a migrated parser.
 *
 * A migrated parser supplies the information page by defining
 * `getInformationEpubItemChildNodes` on its prototype, and tidies it with
 * `cleanInformationNode`. See ADR-0048.
 */
import { describe, expect, it } from "vitest";
import { blockText, LegacyParser } from "../../src/core/parsers/compat/legacy-parser";
import { packEpub } from "../../src/core/epub/packer";

/** A parser written the way the migrated ones are: plain prototype methods. */
class StubParser extends LegacyParser {
    override getChapterUrls(): never[] {
        return [];
    }
    override findContent(): null {
        return null;
    }
}

// Defined on the prototype, as a JavaScript parser's method is. TypeScript
// would refuse a method that overrides the base class's declared property.
const infoSelector = "div.info";
Object.defineProperty(StubParser.prototype, "getInformationEpubItemChildNodes", {
    value: function (this: StubParser, dom: Document): Node[] {
        // Reads `this`, which a parser's method may do.
        expect(this).toBeInstanceOf(StubParser);
        return [...dom.querySelectorAll(infoSelector)];
    },
});
Object.defineProperty(StubParser.prototype, "cleanInformationNode", {
    value: function (node: Element): void {
        for (const nav of node.querySelectorAll("nav.links")) nav.remove();
    },
});

const PAGE = `<html><body><div class="info">
    <h1 class="title">A Story</h1>
    <nav class="links"><a href="/read">Read Now</a></nav>
    <p>The first paragraph.</p><p>The second
        paragraph.</p>
</div></body></html>`;

function page(): Document {
    return new DOMParser().parseFromString(PAGE, "text/html");
}

describe("a migrated parser's information page", () => {
    it("is not hidden by the base class", () => {
        const parser = new StubParser();
        expect(Object.hasOwn(parser, "getInformationEpubItemChildNodes")).toBe(false);
        expect(Object.hasOwn(parser, "findParentNodeOfChapterLinkToRemoveAt")).toBe(false);
        expect(typeof parser.getInformationEpubItemChildNodes).toBe("function");
    });

    it("gives the description, one line per block, cleaned by the parser", () => {
        const description = new StubParser().extractDescription(page());
        expect(description).toBe("A Story\nThe first paragraph.\nThe second paragraph.");
        expect(description).not.toContain("Read Now");
    });
});

describe("blockText", () => {
    it("separates blocks and line breaks, and collapses the spaces", () => {
        const div = new DOMParser()
            .parseFromString("<div>  One<br>Two <p>Three   four</p>Five</div>", "text/html")
            .querySelector("div") as Element;
        expect(blockText(div)).toBe("One\nTwo\nThree four\nFive");
    });
});

describe("the information page", () => {
    it("shows each line of the description as a paragraph", () => {
        const result = packEpub(
            [{ sourceUrl: "https://example.com/1", title: "One", contentHtml: "<p>x</p>" }],
            { title: "A Story", includeInfoPage: true, description: "First.\nSecond." },
        );
        const info = result.files.find((file) => file.path === "OEBPS/text/info.xhtml");
        const text = typeof info?.content === "string" ? info.content : "";
        expect(text).toContain("<p>First.</p>");
        expect(text).toContain("<p>Second.</p>");
    });
});
