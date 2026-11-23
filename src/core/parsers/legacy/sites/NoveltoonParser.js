// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NoveltoonParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("noveltoon.mobi", () => new NoveltoonParser());

export class NoveltoonParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("a.episodes-info-a-item")]
            .map(a => NoveltoonParser.ToChapterInfo(a));
    }

    static ToChapterInfo(link) {
        let title = link.querySelector(".episode-item-num").textContent.trim()
            + " " + link.querySelector(".episode-item-title").textContent.trim();
        return {
            sourceUrl: link.href,
            title: title,
        };
    }

    findContent(dom) {
        return dom.querySelector("div.watch-chapter-detail");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.detail-title");
    }

    extractAuthor(dom) {
        return dom.querySelector("p.detail-author")?.textContent ?? super.extractAuthor(dom);
    }

    findChapterTitle(dom) {
        return dom.querySelector("p.watch-chapter-title")?.textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.detail-top-right");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.detail-desc")];
    }
}

