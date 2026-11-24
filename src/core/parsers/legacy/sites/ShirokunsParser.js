// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ShirokunsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

//dead url/ parser
parserFactory.register("shirokuns.com", () => new ShirokunsParser());

export class ShirokunsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.blog-post li a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.entry-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.main h1");
    }

    preprocessRawDom(chapterDom) {
        util.removeChildElementsMatchingSelector(chapterDom, "p.author, div.col-md-12 img");
    }

    findCoverImageUrl(dom) {
        let img = dom.querySelector("article p img");
        return img === null ? null : img.src;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#editdescription")];
    }
}

