// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Libri7Parser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("libri7.com", () => new Libri7Parser());

export class Libri7Parser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.chapter-list");
        return util.hyperlinksToChapterList(menu).reverse();
    }

    findContent(dom) {
        return dom.querySelector("div.c-chapter");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".p-book-detail h3");
    }

    async fetchChapter(url) {
        return (await HttpClient.fetchHtml(url)).responseXML;
    }

    customRawDomToContentStep(chapter, content) {
        let toParse = content.querySelector("p.pre-line");
        if (toParse !== null) {
            util.convertPreTagToPTags(chapter.rawDom, toParse, "\n\n");
            let div = chapter.rawDom.createElement("div");
            util.convertElement(toParse, div);
        }
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".c-book-cover__wrap");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".book-panel-info__desc")];
    }
}

