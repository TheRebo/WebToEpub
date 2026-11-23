// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ReadindpiaParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("readingpia.me", () => new ReadingpiaParser());

export class ReadingpiaParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".content a:has(div)")]
            .map(link => this.linkToChapter(link)).reverse();
    }

    linkToChapter(link) {
        return ({
            sourceUrl:  link.href,
            title: link.querySelector("div span").textContent,
        });
    }

    findContent(dom) {
        return dom.querySelector("div#chapter-body") 
            || dom.querySelector("div.chapter-body")
            || dom.querySelector("main > div:not(.advertisement):not(.promo-container):not(.comments):not([style])");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h2.novel-title");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector(".info-ans");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.novel-cover");
    }

    getInformationEpubItemChildNodes(dom) {
        return [dom.querySelector(".novel-synopsis")];
    }

}
