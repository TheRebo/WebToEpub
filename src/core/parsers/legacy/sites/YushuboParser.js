// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/YushuboParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("yushubo.net", () => new YushuboParser());

export class YushuboParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocUrl = dom.baseURI.replace("book_", "list_other_");
        let tocDoc = (await HttpClient.wrapFetch(tocUrl)).responseXML;
        let menu = tocDoc.querySelector("ul.chapter-list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return Parser.findConstructedContent(dom);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.article-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".bigpic");
    }

    async fetchChapter(url) {
        let newDoc = Parser.makeEmptyDocForContent(url);
        let dom = (await HttpClient.wrapFetch(url)).responseXML;
        newDoc.content.appendChild(this.findChapterTitle(dom));
        newDoc.content.appendChild(this.findRawContent(dom));
        let nextPageUrl = this.findNextPageUrl(dom);
        while (nextPageUrl != null) {
            dom = (await HttpClient.wrapFetch(nextPageUrl)).responseXML;
            newDoc.content.appendChild(this.findRawContent(dom));
            nextPageUrl = this.findNextPageUrl(dom);
        }
        return newDoc.dom;
    }

    findRawContent(dom) {
        return dom.querySelector("#BookText");
    }

    findNextPageUrl(dom) {
        let links = [...dom.querySelectorAll("div.articlebtn a")]
            .filter(a => a.textContent === "下一页")
            .slice(-1);
        return links[0]?.href;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".book-intro")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "ul.lastchapter");
        return node;
    }
}

