// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ReadLightNovelCcParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("readlightnovel.cc", () => new ReadLightNovelCcParser());

export class ReadLightNovelCcParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("a.chapter-item")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("section.section");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.book-name").textContent;
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.author span.name");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.book-img");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.synopsis")];
    }
}

