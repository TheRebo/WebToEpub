// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovelcoolParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("novelcool.com", () => new NovelcoolParser());

export class NovelcoolParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".chapter-item-list a")]
            .map(this.linkToChapter)
            .reverse();
    }

    linkToChapter(link) {
        return {
            sourceUrl:  link.href,
            title: link.querySelector("span.chapter-item-headtitle").textContent
        };        
    }

    findContent(dom) {
        return dom.querySelector(".chapter-reading-section-list, .overflow-hidden");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.bookinfo-title");
    }

    extractAuthor(dom) {
        return dom.querySelector(".bookinfo-author a")?.textContent ?? null;
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".chapter-end-mark, .chapter-section-report");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".bookinfo-pic");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".bk-summary-txt")];
    }
}

