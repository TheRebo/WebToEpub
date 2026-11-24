// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/TravistranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("travistranslations.com", () => new TravistranslationsParser());

export class TravistranslationsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("section.mb-4 ul.grid a")]
            .map(a => ({
                sourceUrl:  a.href,
                title: a.querySelector("span").textContent.trim()
            }));
    }

    findContent(dom) {
        return dom.querySelector("div.reader-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1[title]");
    }

    findChapterTitle(dom) {
        let h2 = dom.querySelector("div.header h2");
        let span = h2.parentElement.querySelector("span")?.textContent ?? "";
        return h2.textContent + " " + span;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "#primary .container")
            ?.replace("q=55", "q=100") ?? null;
    }

    preprocessRawDom(webPageDom) {
        util.resolveLazyLoadedImages(webPageDom, "img");
        this.addAuthorNotes(webPageDom);
    }

    addAuthorNotes(webPageDom) {
        let content = this.findContent(webPageDom); 
        for (let n of [...content.parentElement.querySelectorAll("div.py-1")]) {
            content.append(n);
        }
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div[property='description']")];
    }
}

