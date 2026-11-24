// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/TruyenParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("truyennhabo.com", () => new TruyenParser());

export class TruyenParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        const chapterLinks = [...dom.querySelectorAll("#clwd ul a")];
        const chapterTitles = [...dom.querySelectorAll("#clwd span.block")];
        const chapterUrls = [];
        for (let i = 0; i < chapterLinks.length; i++) {
            const chapterLink = chapterLinks[i];
            const chapterTitle = chapterTitles[i];
            chapterUrls.push({
                sourceUrl: chapterLink.href,
                title: chapterTitle.textContent,
            });
        }
        return chapterUrls.reverse();
    }

    findContent(dom) {
        return (
            dom.querySelector("article.blog")
        );
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("#extra-info dd");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    findChapterTitle(dom) {
        return dom.querySelector("header h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.auto-rows-max");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#synopsis")];
    }

    removeUnwantedElementsFromContentElement(element) {
        let mark = element.querySelector("a");
        mark.remove();
        super.removeUnwantedElementsFromContentElement(element);
    }

}


