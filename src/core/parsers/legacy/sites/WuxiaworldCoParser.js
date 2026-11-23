// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/WuxiaworldCoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("wuxiaworld.co", () => new WuxiaworldCoParser());
//dead url
parserFactory.register("m.wuxiaworld.co", () => new WuxiaworldCoParser());
//dead url
parserFactory.register("novelupdates.cc", () => new WuxiaworldCoParser());

export class WuxiaworldCoParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let list = dom.querySelector("ul.chapter-list");
        return util.hyperlinksToChapterList(list);
    }

    findContent(dom) {
        return dom.querySelector("div.section-list");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.book-name");
    }

    extractAuthor(dom) {
        return dom.querySelector("div.author span.name").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.book-img");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.synopsis")];
    }
}

