// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MydramanovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("mydramanovel.com", () => new MydramanovelParser());

export class MydramanovelParser extends Parser { // eslint-disable-line no-unused-vars
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("#tdi_47 .td-module-thumb a,#tdi_54 h3.entry-title a")]
            .map(a => this.hyperLinkToChapter(a));
    }

    hyperLinkToChapter(link) {
        return {
            sourceUrl: link.href,
            title: link.getAttribute("title")
        };
    }

    findContent(dom) {
        return dom.querySelector("div.td-post-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.tdb-title-text");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        let span = dom.querySelector(".td-module-thumb a span[data-img-url]");
        return span.getAttribute("data-img-url") ?? null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.tdb_category_description .tdb-block-inner")];
    }
}

