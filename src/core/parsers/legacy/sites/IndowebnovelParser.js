// Migrated from `plugin/js/parsers/IndowebnovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("indowebnovel.id", () => new IndowebnovelParser());

export class IndowebnovelParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.lightnovel-episode");
        return util.hyperlinksToChapterList(menu)
            .map(this.adjustChapterTitle)
            .reverse();
    }

    adjustChapterTitle(chapter) {
        let title = chapter.title.replace(/\r\n|\r|\n|Bahasa Indonesia/g, "");
        let index = title.indexOf("Chapter");
        if (0 < index) {
            title = title.substring(index);
        }
        chapter.title = title.trim();
        return chapter;
    }

    findContent(dom) {
        return [...dom.querySelectorAll("div")]
            .filter(d => d.className === "123")[0];
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.entry-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.entry-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.lightnovel-thumb");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".lightnovel-info, .lightnovel-synopsis")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "script");
    }
}

