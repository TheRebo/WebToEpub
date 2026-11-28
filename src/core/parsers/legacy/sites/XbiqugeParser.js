// Migrated from `plugin/js/parsers/XbiqugeParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("xbiquge.so", () => new XbiqugeParser());

export class XbiqugeParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div#list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    extractLanguage() {
        return "cn";
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.bookname h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#fmimg");
    }

    async fetchChapter(url) {
        // site does not tell us gbk is used to encode text
        let options = { 
            makeTextDecoder: () => new TextDecoder("gbk") 
        };
        return (await HttpClient.wrapFetch(url, options)).responseXML;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#info")];
    }
}

