// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ZhenhunxiaoshuoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("zhenhunxiaoshuo.com", () => new ZhenhunxiaoshuoParser());

export class ZhenhunxiaoshuoParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.excerpts");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("article");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.focusbox-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.article-title");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.focusbox div.container")];
    }
}

