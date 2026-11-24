// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NanomashinonlineParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("nanomashin.online", () => new NanomashinonlineParser());

export class NanomashinonlineParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        return (await this.walkTocPages(dom,
            NanomashinonlineParser.chaptersFromDom,
            NanomashinonlineParser.nextTocPageUrl,
            chapterUrlsUI
        )).reverse();
    }

    static chaptersFromDom(dom) {
        return [...dom.querySelectorAll("h3 a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    static nextTocPageUrl(dom) {
        return dom.querySelector("nav button[rel='next']")?.parentNode?.href ?? null;
    }

    findContent(dom) {
        return dom.querySelector("article div.pt-10");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("body img[decoding]")?.src ?? null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.pt-2")];
    }
}

