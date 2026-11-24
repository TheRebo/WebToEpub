// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/FimfictionParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("fimfiction.net", () => new FimfictionParser());

export class FimfictionParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("ul.chapters a.chapter-title")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div#chapter");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("a.story_name").textContent;
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.info-container a");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "h1.chapter-title div[style='float:right']");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.story_container__story_image");
    }

    getInformationEpubItemChildNodes(dom) {
        let likes = dom.querySelector("span.likes");
        likes.textContent = "Likes: " + likes.textContent;
        return [...dom.querySelectorAll("span.description-text, "
            + "div.chapters-footer div.word_count")].concat(likes);
    }
}

