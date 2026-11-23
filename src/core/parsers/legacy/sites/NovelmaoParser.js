// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovelmaoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("novelmao.com", () => new NovelmaoParser());

export class NovelmaoParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.chapter-list");
        util.removeChildElementsMatchingSelector(menu, "span.time");
        return util.hyperlinksToChapterList(menu).reverse();
    }

    findContent(dom) {
        return dom.querySelector("article");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.single-title");
    }

    removeUnwantedElementsFromContentElement(element) {
        element.querySelector("div.entry-content").removeAttribute("[class]");
        util.removeChildElementsMatchingSelector(element, "div.chapter-nav, " +
            "p.china, div.snpconainer, amp-selector, div#popupreport"
        );
        super.removeUnwantedElementsFromContentElement(element);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.info")];
    }
}

