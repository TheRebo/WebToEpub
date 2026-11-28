// Migrated from `plugin/js/parsers/ReadnovelfullorgParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("readnovelfull.org", () => new ReadnovelfullorgParser());

export class ReadnovelfullorgParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let url = new URL(dom.baseURI);
        let tocUrl = `https://${url.hostname}/api/novels${url.pathname}/chapters?source=detail`;
        let html = (await HttpClient.wrapFetch(tocUrl)).responseXML;
        return [...html.querySelectorAll("ul.chapter-list a")]
            .map(this.linkToChapter)
            .reverse();
    }

    linkToChapter(link) {
        return {
            sourceUrl:  link.href,
            title: link.querySelector(".chapter-title").textContent
        };
    }

    findContent(dom) {
        return dom.querySelector(".content-inner");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return [...dom.querySelectorAll(".breadcrumbs-item")].pop();
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.img-cover");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.section-body p")];
    }
}

