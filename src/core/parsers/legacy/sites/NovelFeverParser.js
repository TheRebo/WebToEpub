// Migrated from `plugin/js/parsers/NovelFeverParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("novelfever.com", () => new NovelFeverParser());

export class NovelFeverParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("#list-chapters");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div#chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        let div = dom.querySelector("div#chapter-infomation div.text-overflow-1-lines");
        return div !== null ? div.textContent : null;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "section#book-infomation");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#about")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "#book-review");
    }    
}

