// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/LightnovelreaderParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("lightnovelreader.org", () => new LightnovelreaderParser());
//dead url
parserFactory.register("lnreader.org", () => new LightnovelreaderParser());
//dead url
parserFactory.register("readlitenovel.com", () => new LightnovelreaderParser());

export class LightnovelreaderParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".novels-detail-chapters a")]
            .map(a => util.hyperLinkToChapter(a)).reverse();
    }

    findContent(dom) {
        return dom.querySelector("#chapterText");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".section-header-title h2");
    }

    extractAuthor(dom) {
        let authorLabel = [...dom.querySelectorAll("a[href*='author']")].map(x => x.textContent.trim());
        return (authorLabel.length === 0) ? super.extractAuthor(dom) : authorLabel.join(", ");
    }

    removeUnwantedElementsFromContentElement(element) {
        let toRemove = [...element.querySelectorAll("center, p")]
            .filter(s => s.textContent.trim().toLowerCase() === "sponsored content");
        util.removeElements(toRemove);
        util.removeChildElementsMatchingSelector(element, ".display-hide, .hidden");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return [...dom.querySelectorAll(".cm-breadcrumb li")].pop();
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".novels-detail-left");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.empty-box:not(.gray-bg-color)")];
    }
}

