// Migrated from `plugin/js/parsers/LeafStudioParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("karistudio.com", () => new LeafStudioParser());
parserFactory.register("leafstudio.site", () => new LeafStudioParser());
parserFactory.register("literaturecity.com", () => new LeafStudioParser());

export class LeafStudioParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector(".novel_index");
        return util.hyperlinksToChapterList(menu).reverse();
    }
    
    findContent(dom) {
        return dom.querySelector(".small");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".title");
    }

    // Remove unwanted elements from fetched content
    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "#font-options-bar, .confuse, .post-rating-wrapper, #donation-msg, #novel_nav, .text-center, .navigation, .clearfix");
        super.removeUnwantedElementsFromContentElement(element);
    }

    extractDescription(dom) {
        return dom.querySelector(".desc_div").textContent.trim();
    }

    findChapterTitle(dom) {
        return dom.querySelector(".title");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.desc_div p")];
    }
}

