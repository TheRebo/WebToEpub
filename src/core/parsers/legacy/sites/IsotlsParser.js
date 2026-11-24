// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/IsotlsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("isotls.com", () => new IsotlsParser());

export class IsotlsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.table-of-contents");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("article");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("header h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "header, nav, footer");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.title;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "section.project-information");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("section.project-information > div")];
    }
}

