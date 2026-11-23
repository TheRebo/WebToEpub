// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovelplexParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("novelplex.org", () => new NovelplexParser());

export class NovelplexParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".nAP__TOCArea a")]
            .map(a => this.hyperLinkToChapter(a));
    }

    hyperLinkToChapter(link) {
        return ({
            sourceUrl: link.href,
            title: link.querySelector("p").textContent
        });
    }

    findContent(dom) {
        return dom.querySelector(".halChap--kontenInner");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".headerNovel__wrap h2");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".pt_aBody, .pt_aButton");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector(".halChap h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".headerNovel");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".summary_mobile")];
    }
}

