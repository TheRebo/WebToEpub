// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/FictionhuntParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("fictionhunt.com", () => new FictionhuntParser());

export class FictionhuntParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("a.StoryContents__chapter-name")]
            .map(this.linkToChapter);
    }

    linkToChapter(link) {
        let label = link.querySelector(".chapter-number").textContent;
        let title = link.querySelector(".chapter-title").textContent;
        return ({
            sourceUrl:  link.href,
            title: label + ": " + title
        });
    }

    findContent(dom) {
        return dom.querySelector("div.StoryChapter__text");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    extractAuthor(dom) {
        return dom.querySelector(".Story__meta a")?.textContent ?? null;
    }

    findChapterTitle(dom) {
        return dom.querySelector("h2.js-chapter-title");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.text-justify")];
    }
}

