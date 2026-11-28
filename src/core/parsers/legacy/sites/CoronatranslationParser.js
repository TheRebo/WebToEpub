// Migrated from `plugin/js/parsers/CoronatranslationParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("coronatranslation.com", () => new CoronatranslationParser());

export class CoronatranslationParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        return (await this.walkTocPages(dom, 
            CoronatranslationParser.chaptersFromDom, 
            CoronatranslationParser.nextTocPageUrl, 
            chapterUrlsUI
        )).reverse();
    }

    static chaptersFromDom(dom) {
        return [...dom.querySelectorAll("h2.post-title a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    static nextTocPageUrl(dom) {
        let link = dom.querySelector("div.wp-pagenavi a.nextpostslink");
        return link === null ? null : link.href;
    }

    findContent(dom) {
        return dom.querySelector("div.entry");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.post-title");
    }

    getInformationEpubItemChildNodes() {
        return [];
    }
}

