// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ZenithNovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

//dead url/ parser
parserFactory.register("zenithnovels.com", () => new ZenithNovelsParser());

export class ZenithNovelsParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    getChapterUrls(dom, chapterUrlsUI) {
        return this.getChapterUrlsFromMultipleTocPages(dom,
            ZenithNovelsParser.extractPartialChapterList,
            ZenithNovelsParser.getUrlsOfTocPages,
            chapterUrlsUI
        ).then(l => l.reverse());
    }

    static getUrlsOfTocPages(dom) {
        return [...dom.querySelectorAll("ul.lcp_paginator a:not(.lcp_nextlink)")]
            .map(link => link.href);
    }
    
    static extractPartialChapterList(dom) {
        let list = dom.querySelector("ul.lcp_catlist");
        return util.hyperlinksToChapterList(list);
    }
    
    findContent(dom) {
        return dom.querySelector("article");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.entry p")];
    }
}

