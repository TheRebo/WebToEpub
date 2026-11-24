// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/PtwxzParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("piaotia.com", () => new PtwxzParser());

export class PtwxzParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocUrl = dom.querySelector("#content table tbody tr td table caption a").href;
        let tocDom = await this.fetchChapter(tocUrl);
        let table = tocDom.querySelector("div.centent");
        return util.hyperlinksToChapterList(table);
    }

    findContent(dom) {
        return dom.querySelector("body");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("#content table table table h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "#guild, #shop, .toplink, table, #feit2, #Commenddiv, .bottomlink");
        super.removeUnwantedElementsFromContentElement(element);
    }

    async fetchChapter(url) {
        // site does not tell us gbk is used to encode text
        let options = { makeTextDecoder: () => new TextDecoder("gbk") };
        return (await HttpClient.wrapFetch(url, options)).responseXML;
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("#content table table a:not([tiptitle]) img")?.src ?? null;
    }
}

