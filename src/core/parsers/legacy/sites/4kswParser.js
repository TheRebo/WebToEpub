// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/4kswParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("4ksw.com", () => new _4kswParser());

export class _4kswParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.list-charts");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector(".content-body");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".panel-heading");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".info1");
    }

    async fetchChapter(url) {
        let options = { makeTextDecoder: () => new TextDecoder("gbk") };
        return (await HttpClient.wrapFetch(url, options)).responseXML;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".info2 div")];
    }
}

