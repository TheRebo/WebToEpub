// Migrated from `plugin/js/parsers/HiscensionParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("hiscension.com", () => new HiscensionParser());

export class HiscensionParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let chapters = [...dom.querySelectorAll("table.wp-block-table td a")]
            .map(a => util.hyperLinkToChapter(a));
        return Promise.resolve(chapters);
    }

    findContent(dom) {
        return dom.querySelector("div.blog-post-single-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("article h1");
    }
}

