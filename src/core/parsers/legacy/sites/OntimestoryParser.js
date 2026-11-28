// Migrated from `plugin/js/parsers/OntimestoryParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("ontimestory.eu", () => new OntimestoryParser());

export class OntimestoryParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("article p a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.post-content, div.entry-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.page-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.post-title, .entry-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "article");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("article p")]
            .filter(p => p.querySelector("a") === null);
    }
}

