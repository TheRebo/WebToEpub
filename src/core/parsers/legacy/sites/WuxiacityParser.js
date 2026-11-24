// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/WuxiacityParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("wuxia.city", () => new WuxiacityParser());

export class WuxiacityParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        if (!dom.baseURI.endsWith("/table-of-contents")) {
            dom = (await HttpClient.wrapFetch(dom.baseURI + "/table-of-contents")).responseXML;
        }
        return [...dom.querySelectorAll("ul.chapters a")]
            .reverse()
            .map(WuxiacityParser.linkToChapter);
    }

    static linkToChapter(link) {
        return ({
            sourceUrl:  link.href,
            title: link.querySelector(".chapter-name").textContent.replace(/\n/g, " ")
        });
    }

    findContent(dom) {
        return dom.querySelector("#chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".book-name");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".chapter-title p").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.book-img");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.book-synopsis")];
    }
}

