// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/OctopiiParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("octopii.co", () => new OctopiiParser());

export class OctopiiParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.chapter-list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector(".content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("main h3");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".page-cover");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.description")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, ".btn-show-more");
        return node;
    }
}

