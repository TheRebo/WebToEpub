// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MMyWwuxiaWorldParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("m.mywuxiaworld.com", () => new MMyWwuxiaWorldParser());

export class MMyWwuxiaWorldParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let newDom = (await HttpClient.wrapFetch(dom.baseURI + "dir.html")).responseXML;
        return [...newDom.querySelectorAll("div.chapter-list a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.pt-read-cont");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.pt-bookdetail a");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.pt-read div").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.pt-bookdetail");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.pt-bookdetail > div.flex-item, span.pt-book-intro")];
    }
}

