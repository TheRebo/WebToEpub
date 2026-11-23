// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/IsekaiScanParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("isekaiscan.com", () => new IsekaiScanParser());

export class IsekaiScanParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.version-chap");
        return util.hyperlinksToChapterList(menu).reverse();
    }

    findContent(dom) {
        let content = dom.querySelector("div.reading-content");
        for (let i of content.querySelectorAll("img")) {
            let data_src = i.getAttribute("data-src");
            if (!util.isNullOrEmpty(data_src)) {
                i.src = data_src;
            }
        }
        return content;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.summary_image");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("divsummary__content")];
    }
}

