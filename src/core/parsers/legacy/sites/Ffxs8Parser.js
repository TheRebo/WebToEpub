// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Ffxs8Parser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("ffxs8.com", () => new Ffxs8Parser());

export class Ffxs8Parser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.catalog");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div.content");
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.article h1");
    }
    
    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.cover");
    }

    async fetchChapter(url) {
        return (await HttpClient.wrapFetch(url, this.makeOptions())).responseXML;
    }

    makeOptions() {
        return ({
            makeTextDecoder: () => new TextDecoder("gb2312")
        });
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.descInfo")];
    }
}

