// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/SjuukanshuParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("sj.uukanshu.com", () => new SjuukanshuParser());

export class SjuukanshuParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("#listCont .ml-list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#bookContent");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.bookname");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h3");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".book-info");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.desc")];
    }
}

