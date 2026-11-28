// Migrated from `plugin/js/parsers/MtlreaderParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("mtlreader.com", () => new MtlreaderParser());

export class MtlreaderParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("table.table-responsive");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div.chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.agent-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.text-center").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.container");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#editdescription")];
    }
}

