// Migrated from `plugin/js/parsers/ZeonicrepublicParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("zeonic-republic.net", () => new ZeonicrepublicParser());

export class ZeonicrepublicParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let links = [...dom.querySelectorAll("div.info a")];
        if (links.length === 0) {
            links = [...dom.querySelectorAll("div.entry a")];
        }
        return links.map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h2.title");
    }

    findCoverImageUrl(dom) {
        let img = dom.querySelector("div.book-info .cover img");
        return (img === null)
            ? util.getFirstImgSrc(dom, "div.entry")
            : util.getFirstImgSrc(dom, "div.book-info .cover");
    }
}

