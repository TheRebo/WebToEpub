// Migrated from `plugin/js/parsers/AerialrainParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("aerialrain.com", () => new AerialrainParser());

export class AerialrainParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("ul.frame-links-list a")]
            .map(a => util.hyperLinkToChapter(a)).reverse();
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.entry-content");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.blog-detail-description p")];
    }
}

