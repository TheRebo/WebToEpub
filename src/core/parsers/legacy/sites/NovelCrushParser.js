// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovelCrushParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("novelcrush.com", () => new NovelCrushParser());

export class NovelCrushParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let toc = dom.querySelector("div.page-content-listing");
        return util.hyperlinksToChapterList(toc).reverse();
    }

    findContent(dom) {
        return dom.querySelector("div.text-left div.reading-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.post-title h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.author-content a");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    findChapterTitle(dom) {
        return dom.querySelector("ol.breadcrumb li.active").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.summary_image");
    }

    preprocessRawDom(chapterDom) {
        util.removeChildElementsMatchingSelector(chapterDom, "ins[data-ad-format]");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.summary__content")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "div.heateor_sss_sharing_container");
        return node;
    }
}

