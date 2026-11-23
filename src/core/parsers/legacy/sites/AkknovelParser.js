// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/AkknovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("akknovel.com", () => new AkknovelParser());

export class AkknovelParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.chapter-item a")]
            .map(link => this.linkToChapter(link));
    }

    linkToChapter(link) {
        let span = link.querySelector("span");
        let title = span.textContent.trim() + " " + span.nextSibling.textContent.trim();
        return ({
            sourceUrl:  link.href,
            title: title,
        });
    }

    findContent(dom) {
        return (
            dom.querySelector("#chr-content") || dom.querySelector("#chapter-content")
        );
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.aspect-h-4");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.leading-7")];
    }
}

