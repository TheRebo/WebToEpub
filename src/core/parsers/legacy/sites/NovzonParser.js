// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovzonParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("novzon.net", () => new NovzonParser());

export class NovzonParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 500;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.novel-title");
    }

    extractAuthor(dom) {
        let authorLink = dom.querySelector("a.author-tag");
        return authorLink?.textContent?.trim() ?? super.extractAuthor(dom);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.novel-cover-wrapper");
    }

    extractLanguage() {
        return "tr";
    }

    findContent(dom) {
        return dom.querySelector("div#chapter-content");
    }

    removeUnwantedElementsFromContentElement(element) {
        super.removeUnwantedElementsFromContentElement(element);
        util.removeElements(element.querySelectorAll(
            "#chapter-content-end-sentinel, #zen-spacer"
        ));
    }

    getChapterUrls(dom) {
        let chapterLinks = dom.querySelectorAll("div.chapter-list-grid a.chapter-item");
        let extract = (link, css) => link.querySelector(css)?.textContent?.trim() ?? "";
        return Array.from(chapterLinks).map((link) => {
            let number = extract(link, "span.chapter-number");
            let title = extract(link, "div.chapter-title");
            return {
                sourceUrl: link.href,
                title: [number, title].filter((part) => part).join(" - ")
            };
        });
    }
}
