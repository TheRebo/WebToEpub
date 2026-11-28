// Migrated from `plugin/js/parsers/BetwixtedbutterflyParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("betwixtedbutterfly.com", () => new BetwixtedbutterflyParser());

export class BetwixtedbutterflyParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.elementor-tab-content a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.entry-inner");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h2.elementor-heading-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.post-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "article");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.elementor-text-editor")].slice(1, 2);
    }
}

