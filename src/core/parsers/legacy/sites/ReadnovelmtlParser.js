// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ReadnovelmtlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("readnovelmtl.com", () => new ReadnovelmtlParser());

export class ReadnovelmtlParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector(".accordion");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".card-body");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".mb-4 p")];
    }
}

