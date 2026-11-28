// Migrated from `plugin/js/parsers/TeanovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("teanovel.com", () => new TeanovelParser());
//dead url
parserFactory.register("teanovel.net", () => new TeanovelParser());

export class TeanovelParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let storyName = new URL(dom.baseURI).pathname.split("/").pop();
        let tocUrl = `https://www.teanovel.com/novel/${storyName}/chapter-list`;
        let chapterDom = (await HttpClient.fetchHtml(tocUrl)).responseXML;
        return [...chapterDom.querySelectorAll("a.flex")]
            .map(a => this.linkToChapter(a))
            .filter(a => a.title);
    }

    linkToChapter(link) {
        return ({
            sourceUrl:  link.href,
            title: link.querySelector("p.text-sm")?.innerText?.trim(),
        });
    }

    findContent(dom) {
        return dom.querySelector("div.prose");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "flex");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("main img")?.src;
    }
    getInformationEpubItemChildNodes(dom) {
        return [dom.querySelector("article")];
    }
}

