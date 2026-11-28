// Migrated from `plugin/js/parsers/ReaderNovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("readernovel.net", () => new ReaderNovelParser());

export class ReaderNovelParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".chapter-list-wrapper a")]
            .map(link => this.linkToChapter(link))
            .reverse();
    }

    linkToChapter(link) {
        let title = link.getAttribute("title");
        return ({
            sourceUrl:  link.href,
            title: title,
        });
    }

    findContent(dom) {
        return (
            dom.querySelector("div#chapter-container") || dom.querySelector("#chapter-content")
        );
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".page-title");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("li.list-group-item a");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    findChapterTitle(dom) {
        return dom.querySelector("span.chapter-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".manga-image");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#collapseSummary")];
    }

}
