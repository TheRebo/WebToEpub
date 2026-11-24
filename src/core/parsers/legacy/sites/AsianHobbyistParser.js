// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/AsianHobbyistParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("asianhobbyist.com", () => new AsianHobbyistParser());

export class AsianHobbyistParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.releases-wrap a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".post-title.entry-title a");
    }

    findContent(dom) {
        let content = super.findContent(dom);
        if (content == null) {
            content = dom.querySelector(".reader-content");
        }
        return content;
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "div.code-block, div.osny-nightmode");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("header.page-header h2, header.page-header h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.thumb");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.details")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, ".btn");
    }    
}

