// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/XiaxuenovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("xiaxuenovels.xyz", () => new XiaxuenovelsParser());

export class XiaxuenovelsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.sp-body a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.post-title");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".cb_p6_patreon_button, "+
            ".jp-relatedposts, xiaxu-after-content");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".entry-content");
    }    
}

