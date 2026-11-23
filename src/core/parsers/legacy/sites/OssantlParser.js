// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/OssantlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("ossantl.com", () => new OssantlParser());

export class OssantlParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.eplister a")]
            .map(a => this.linkToChapter(a));
    }

    linkToChapter(link) {
        let title = this.concatTextContent(link, ".epl-num, .epl-title");
        return {
            sourceUrl:  link.href,
            title: title,
        };
    }

    findContent(dom) {
        return dom.querySelector("div.entry-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".entry-title");
    }

    findChapterTitle(dom) {
        return this.concatTextContent(dom, "h1.entry-title, div.cat-series");
    }

    concatTextContent(element, selector) {
        return [...element.querySelectorAll(selector)]
            .map(e => e.textContent.trim())
            .join(" ");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.thumb");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.entry-content")];
    }
}

