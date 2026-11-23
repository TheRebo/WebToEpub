import { beforeEach, describe, expect, it } from "vitest";
import {
    convertPreTagToPTags,
    elementText,
    getFirstImgSrc,
    hyperLinkToChapter,
    hyperlinksToChapterList,
    moveChildElements,
    removeChildElementsMatchingSelector,
    removeComments,
    removeEmptyDivElements,
    removeElements,
    removeLeadingWhiteSpace,
    removeShareLinkElements,
    removeTrailingWhiteSpace,
    removeUnwantedWordpressElements,
    resolveUrl,
} from "../../src/core/util/dom";

/** Parse an HTML fragment into a document. */
function parse(html: string): Document {
    return new DOMParser().parseFromString(html, "text/html");
}

describe("removeElements", () => {
    it("removes every node in the list", () => {
        const dom = parse("<div><p class='x'>a</p><p class='x'>b</p><p class='x'>c</p></div>");
        const div = dom.querySelector("div") as Element;
        removeElements(div.querySelectorAll(".x"));
        expect(div.querySelectorAll(".x")).toHaveLength(0);
    });

    it("tolerates a missing list", () => {
        expect(() => removeElements(null)).not.toThrow();
        expect(() => removeElements(undefined)).not.toThrow();
    });
});

describe("removeChildElementsMatchingSelector", () => {
    it("removes only the matching descendants", () => {
        const dom = parse("<div><span class='ad'>x</span><p>keep</p></div>");
        const div = dom.querySelector("div") as Element;
        removeChildElementsMatchingSelector(div, ".ad");
        expect(div.innerHTML).not.toContain("ad");
        expect(div.textContent).toContain("keep");
    });
});

describe("removeComments", () => {
    it("strips comments from the tree", () => {
        const dom = parse("<div><!-- a secret --><p>text</p></div>");
        const div = dom.querySelector("div") as Element;
        removeComments(div);
        expect(div.innerHTML).not.toContain("secret");
        expect(div.textContent).toContain("text");
    });
});

describe("removeEmptyDivElements", () => {
    it("removes divs with no text and no children", () => {
        const dom = parse("<div><div></div><div> </div><div><p>keep</p></div></div>");
        const div = dom.querySelector("div") as Element;
        removeEmptyDivElements(div);
        expect(div.querySelectorAll("div")).toHaveLength(1);
    });

    it("removes a div that only contains an empty div", () => {
        const dom = parse("<div><div><div></div></div></div>");
        const div = dom.querySelector("div") as Element;
        removeEmptyDivElements(div);
        expect(div.querySelectorAll("div")).toHaveLength(0);
    });
});

describe("removeLeadingWhiteSpace and removeTrailingWhiteSpace", () => {
    it("trim the whitespace at each end", () => {
        const dom = parse("<div>   <p>text</p>   </div>");
        const div = dom.querySelector("div") as Element;
        removeLeadingWhiteSpace(div);
        removeTrailingWhiteSpace(div);
        expect(div.firstChild?.nodeName).toBe("P");
        expect(div.lastChild?.nodeName).toBe("P");
    });
});

describe("moveChildElements", () => {
    it("moves every child and empties the source", () => {
        const dom = parse("<div id='a'><p>one</p><p>two</p></div><div id='b'></div>");
        const source = dom.querySelector("#a") as Element;
        const target = dom.querySelector("#b") as Element;
        moveChildElements(source, target);
        expect(target.children).toHaveLength(2);
        expect(source.children).toHaveLength(0);
    });
});

describe("removeUnwantedWordpressElements", () => {
    it("removes the sharing and metadata cruft", () => {
        const dom = parse(
            "<div><div class='sharedaddy'>share</div><div class='entry-meta'>meta</div><p>story</p></div>",
        );
        const div = dom.querySelector("div") as Element;
        removeUnwantedWordpressElements(div);
        expect(div.textContent).not.toContain("share");
        expect(div.textContent).not.toContain("meta");
        expect(div.textContent).toContain("story");
    });
});

describe("removeShareLinkElements", () => {
    it("removes social sharing links", () => {
        const dom = parse(
            "<div><a href='https://facebook.com/sharer/x'>f</a><a href='https://example.com/chapter'>c</a></div>",
        );
        const div = dom.querySelector("div") as Element;
        removeShareLinkElements(div);
        expect(div.querySelectorAll("a")).toHaveLength(1);
    });
});

describe("getFirstImgSrc", () => {
    it("finds the first image in a container", () => {
        const dom = parse("<div id='c'><img src='cover.jpg'></div>");
        expect(getFirstImgSrc(dom, "#c")).toBe("cover.jpg");
    });

    it("falls back to data-src", () => {
        const dom = parse("<div id='c'><img data-src='lazy.jpg'></div>");
        expect(getFirstImgSrc(dom, "#c")).toBe("lazy.jpg");
    });

    it("returns null when there is no image", () => {
        const dom = parse("<div id='c'></div>");
        expect(getFirstImgSrc(dom, "#c")).toBeNull();
        expect(getFirstImgSrc(dom, "#missing")).toBeNull();
    });
});

describe("convertPreTagToPTags", () => {
    it("splits a pre block into paragraphs", () => {
        const dom = parse("<div><pre>first line\nsecond line</pre></div>");
        const pre = dom.querySelector("pre") as Element;
        convertPreTagToPTags(dom, pre);
        const paragraphs = dom.querySelectorAll("p");
        expect(paragraphs).toHaveLength(2);
        expect(paragraphs[0]?.textContent).toBe("first line");
        expect(paragraphs[1]?.textContent).toBe("second line");
    });

    it("removes a pre block that holds nothing", () => {
        const dom = parse("<div><pre>   \n  </pre></div>");
        const pre = dom.querySelector("pre") as Element;
        convertPreTagToPTags(dom, pre);
        expect(dom.querySelector("pre")).toBeNull();
    });
});

describe("hyperLinkToChapter", () => {
    it("reads the href and the text", () => {
        const dom = parse("<a href='/chapter-1'>Chapter One</a>");
        const chapter = hyperLinkToChapter(dom.querySelector("a") as Element);
        expect(chapter?.title).toBe("Chapter One");
        // The URL is absolute: the fetcher cannot use a relative one.
        expect(chapter?.sourceUrl).toBe("http://localhost:3000/chapter-1");
    });

    it("resolves a relative link against the document's base", () => {
        const dom = parse("<a href='chapter-2'>Two</a>");
        const base = dom.createElement("base");
        base.setAttribute("href", "https://example.com/novel/");
        dom.head?.prepend(base);
        const chapter = hyperLinkToChapter(dom.querySelector("a") as Element);
        expect(chapter?.sourceUrl).toBe("https://example.com/novel/chapter-2");
    });

    it("keeps an absolute link as it is", () => {
        const dom = parse("<a href='https://example.com/c/3'>Three</a>");
        const chapter = hyperLinkToChapter(dom.querySelector("a") as Element);
        expect(chapter?.sourceUrl).toBe("https://example.com/c/3");
    });

    it("rejects a link that is not a chapter", () => {
        const dom = parse(
            "<a href='#top'>top</a><a href='javascript:void(0)'>x</a><a href='mailto:a@b.c'>m</a><a>none</a>",
        );
        for (const anchor of Array.from(dom.querySelectorAll("a"))) {
            expect(hyperLinkToChapter(anchor)).toBeNull();
        }
    });
});

describe("hyperlinksToChapterList", () => {
    it("collects every usable link", () => {
        const dom = parse(
            "<div><a href='/c/1'>One</a><a href='/c/2'>Two</a><a href='#x'>skip</a></div>",
        );
        const chapters = hyperlinksToChapterList(dom.querySelector("div") as Element);
        expect(chapters.map((chapter) => chapter.title)).toEqual(["One", "Two"]);
    });

    it("returns an empty list for a missing element", () => {
        expect(hyperlinksToChapterList(null as unknown as Element)).toEqual([]);
    });
});

describe("resolveUrl", () => {
    it("resolves a relative URL against a base", () => {
        expect(resolveUrl("/chapter-1", "https://example.com/story/")).toBe(
            "https://example.com/chapter-1",
        );
    });

    it("returns null for a URL that cannot be resolved", () => {
        expect(resolveUrl("http://", "not a base")).toBeNull();
    });
});

describe("elementText", () => {
    it("normalises the whitespace", () => {
        const dom = parse("<p>  a \n  b  </p>");
        expect(elementText(dom.querySelector("p"))).toBe("a b");
    });

    it("returns an empty string for a missing element", () => {
        expect(elementText(null)).toBe("");
        expect(elementText(undefined)).toBe("");
    });
});

describe("the DOM helpers do not leak between tests", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("leaves the document alone", () => {
        expect(document.body.innerHTML).toBe("");
    });
});
