// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovelsRockParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("novelsrock.com", () => new NovelsRockParser());

export class NovelsRockParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let chapters = [...dom.querySelectorAll("li.wp-manga-chapter a")]
            .filter(a => (a.querySelector("img") === null))
            .map(a => util.hyperLinkToChapter(a));
        return Promise.resolve(chapters.reverse());
    }

    findContent(dom) {
        let content = dom.querySelector("div.read-container");
        return (content === null)
            ? dom.querySelector("div.reading-content") 
            : content;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.post-title h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.author-content");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1#chapter-heading");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.summary_image");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.summary__content")];
    }
}

