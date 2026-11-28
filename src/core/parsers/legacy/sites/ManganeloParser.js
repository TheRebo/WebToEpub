// Migrated from `plugin/js/parsers/ManganeloParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("manganelo.com", () => new ManganeloParser());

export class ManganeloParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.panel-story-chapter-list a")]
            .map(a => util.hyperLinkToChapter(a))
            .reverse();
    }

    findContent(dom) {
        return dom.querySelector("div.container-chapter-reader");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.story-info-right h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.story-info-left");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#panel-story-info-description")];
    }
}

