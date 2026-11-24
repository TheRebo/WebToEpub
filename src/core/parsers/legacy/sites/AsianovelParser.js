// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/AsianovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("asianovel.net", () => new AsianovelParser());

export class AsianovelParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".chapter-group__list a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("#chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".story__identity-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".chapter__title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "article");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".story__summary")];
    }
}

