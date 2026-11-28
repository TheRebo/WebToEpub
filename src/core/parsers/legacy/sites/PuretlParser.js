// Migrated from `plugin/js/parsers/PuretlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("puretl.com", () => new PuretlParser());

export class PuretlParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.accordion-items-container")
            || dom.querySelector("ul.archive-group-list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return [...dom.querySelectorAll("div.sqs-html-content")][1];
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".content .sqs-html-content p");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".content .sqs-html-content")];
    }
}

