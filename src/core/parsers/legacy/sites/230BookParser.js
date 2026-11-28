// Migrated from `plugin/js/parsers/230BookParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//broken url
parserFactory.register("230book.net", () => new _230BookParser() );
parserFactory.register("38xs.com", () => new _38xsParser() );

export class _230BookBaseParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("#list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("#info h1").textContent;
    }

    findChapterTitle(dom) {
        return dom.querySelector(".bookname h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "#fmimg");
    }

    makeOptions() {
        return ({
            makeTextDecoder: () => new TextDecoder("gbk")
        });
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#intro")];
    }
}

export class _230BookParser extends _230BookBaseParser {
    constructor() {
        super();
    }

    async fetchChapter(url) {
        // site does not tell us gbk is used to encode text
        return (await HttpClient.wrapFetch(url, this.makeOptions())).responseXML;
    }
}

export class _38xsParser extends _230BookBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let links = [...dom.querySelectorAll("#list dd a")];
        return this.removeDuplicatesFromFrontOfList(links)
            .map(a => util.hyperLinkToChapter(a));
    }

    removeDuplicatesFromFrontOfList(list) {
        let keys = new Set();
        let filtered = [];
        while (0 < list.length) {
            let item = list.pop();
            if (!keys.has(item.href)) {
                keys.add(item.href);
                filtered.push(item);
            }
        }
        return filtered.reverse();
    }

    async fetchChapter(url) {
        return this.walkPagesOfChapter(url, this.moreChapterTextUrl);
    }

    moreChapterTextUrl(dom) {
        let nextUrl = dom.querySelector("a#pager_next");
        return (nextUrl != null && nextUrl.href.includes("_"))
            ? nextUrl.href
            : null;
    }

}

