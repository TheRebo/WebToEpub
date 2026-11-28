// Migrated from `plugin/js/parsers/BiqugetwParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("biquge.tw", () => new BiqugetwParser());

export class BiqugetwParser extends Parser { // eslint-disable-line no-unused-vars
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocUrl = dom.querySelector("a.chapterlist").href;
        let tocHtml = (await HttpClient.wrapFetch(tocUrl)).responseXML;
        let menu = tocHtml.querySelector("div.booklist ul");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#chaptercontent");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".book h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector(".book .right h2 a");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    extractLanguage() {
        return "zh";
    }

    findChapterTitle(dom) {
        return dom.querySelector(".book h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".cover");
    }

    async fetchChapter(url) {
        return this.walkPagesOfChapter(url, this.moreChapterTextUrl);
    }

    moreChapterTextUrl(dom) {
        let isNextPageOfChapter = (link) => link.href.includes("_");
        let nextUrl = [...dom.querySelectorAll("a#next_url")]
            .filter(isNextPageOfChapter)
            .map(a => a.href)
            .pop();
        return nextUrl ?? null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.intro")];
    }
}

