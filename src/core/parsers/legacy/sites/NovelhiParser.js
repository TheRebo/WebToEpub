// Migrated from `plugin/js/parsers/NovelhiParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("novelhi.com", () => new NovelhiParser());

export class NovelhiParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocUrl = dom.querySelector("div.bookChapter a.fr").href;
        let tocDom = (await HttpClient.wrapFetch(tocUrl)).responseXML;
        return [...tocDom.querySelectorAll("div.dirList a")]
            .map(a => NovelhiParser.LinkToChapter(a));
    }

    static LinkToChapter(link) {
        return {
            sourceUrl: link.href,
            title: link.querySelector("span").textContent
        };
    }

    findContent(dom) {
        return dom.querySelector("#readcontent #showReading");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.tit h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("#readcontent .book_title h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.bookCover");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.intro_txt")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "a");        
        return node;
    }    
}

