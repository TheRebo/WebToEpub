// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/QuotevParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("quotev.com", () => new QuotevParser());

export class QuotevParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let baseUrl = dom.baseURI;
        if (!baseUrl.endsWith("/")) {
            const index = baseUrl.lastIndexOf("/");
            baseUrl = baseUrl.substring(0, index + 1);
        }
        let select = dom.querySelector("div#footer_pages select");
        if (select === null) {
            return this.makeUrlListForSingleChapterStory(dom);
        }
        return [...select.querySelectorAll("option")]
            .map(o => this.optionToChapter(o, baseUrl));
    }

    optionToChapter(option, baseUrl) {
        return {
            sourceUrl:  baseUrl + option.getAttribute("value"),
            title: option.textContent,
        };
    }

    makeUrlListForSingleChapterStory(dom) {
        let title = this.extractTitleImpl(dom).textContent.trim();
        return [({
            sourceUrl:  dom.baseURI,
            title: title,
        })];
    }

    findContent(dom) {
        return dom.querySelector("div#quizResArea");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div#quizHeaderTitle h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.quizAuthorList a");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#quizResArea");
    }
}

