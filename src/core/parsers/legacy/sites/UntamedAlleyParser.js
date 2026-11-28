// Migrated from `plugin/js/parsers/UntamedAlleyParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("untamedalley.com", () => new UntamedAlleyParser());

export class UntamedAlleyParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        return (await this.walkTocPages(dom, 
            this.chaptersFromDom, 
            this.nextTocPageUrl, 
            chapterUrlsUI
        )).reverse();
    }

    chaptersFromDom(dom) {
        return [...dom.querySelectorAll("#primary h2 a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    nextTocPageUrl(dom) {
        return dom.querySelector("div.nav-previous a")?.href;
    }

    findContent(dom) {
        return dom.querySelector("div.entry-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".page-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".entry-title");
    }
}

