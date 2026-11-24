// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Brittanypage43Parser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { UIText } from "../../compat/legacy-globals.js";

parserFactory.register("brittanypage43.com", () => new Brittanypage43Parser());
HttpClient.blockedSites.add("brittanypage43.com");

export class Brittanypage43Parser extends Parser {
    constructor() {
        super();
    }

    disabled() {
        return UIText.Warning.parserDisabledNotification;
    }
    
    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("a.post-card-content-link")]
            .map(this.linkToChapter).reverse();
    }

    linkToChapter(link) {
        return {
            sourceUrl:  link.href,
            title: link.querySelector(".post-card-title").textContent.trim()
        };
    }

    findContent(dom) {
        return dom.querySelector(".gh-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".post-card-large header h2");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".article-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".post-card-image-link");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".post-card-excerpt")];
    }
}

