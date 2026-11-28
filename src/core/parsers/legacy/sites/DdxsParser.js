// Migrated from `plugin/js/parsers/DdxsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("ddxs.com", () => new DdxsParser());

export class DdxsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("table:nth-of-type(2) tr a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("#contents");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".book h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("dd h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".pic");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".intro")];
    }
}

