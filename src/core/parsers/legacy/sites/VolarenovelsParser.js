// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/VolarenovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("volarenovels.com", () => new VolarenovelsParser());

export class VolarenovelsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("ul.list-chapters a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.panel-body div.fr-view");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h3.title");
    }

    extractDescription(dom) {
        return dom.querySelector("div#Details").textContent.trim();
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.panel-body h4");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#content-container");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#Details")];
    }
}

