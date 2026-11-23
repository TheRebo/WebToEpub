// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NobadnovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  Parses files on www.nobadnovel.com
*/

parserFactory.register("nobadnovel.com", () => new NobadnovelParser());

export class NobadnovelParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 500;
    }

    async getChapterUrls(dom) {
        let tocHtml = (await HttpClient.wrapFetch(dom.baseURI)).responseXML;
        let table = tocHtml.querySelector("#table");
        return util.hyperlinksToChapterList(table);
    }

    findContent(dom) {
        return dom.querySelector("div.text-base");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("title");
    }

    extractDescription(dom) {
        return dom.querySelector("div.content").textContent.trim();
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("img.object-cover")?.src ?? null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.content")];
    }
}

