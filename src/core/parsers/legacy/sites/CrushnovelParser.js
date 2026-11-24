// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/CrushnovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("crushnovelpo.blog", () => new CrushnovelParser());
parserFactory.register("crushnovel6.blog", () => new CrushnovelParser());
parserFactory.register("crushnovels.net", () => new CrushnovelParser());

export class CrushnovelParser extends Parser { // eslint-disable-line no-unused-vars
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let numPages = this.getNumberOfPages(dom);
        let urlRoot = dom.baseURI.replace("/novel/", "/read/") + "/chapter-";
        if (50 < numPages) {
            let chapters = [];
            for (let i = 1; i < numPages; ++i) {
                chapters.push(({
                    title:  "Chapter " + i,
                    sourceUrl: urlRoot + i
                }));
            }
            return chapters;
        }

        return [...dom.querySelectorAll("#chapters a")]
            .map(a => ({
                title: a.querySelector("h4").textContent,
                sourceUrl: a.href
            }));
    }

    getNumberOfPages(dom) {
        let script = [...dom.querySelectorAll("script")]
            .map(s => s.textContent)
            .filter(s => s.includes("numberOfPages"))[0];
        if (script) {
            let json = JSON.parse(script);
            return json.numberOfPages;
        }
        return 0;
    }

    findContent(dom) {
        return dom.querySelector(".chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("main h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".container h2");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".book-cover");
    }

    preprocessRawDom(webPageDom) {
        let content = this.findContent(webPageDom);
        let toKeep = [...content.querySelectorAll(".prose")];
        content.replaceChildren();
        toKeep.forEach(e => content.appendChild(e));
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#story-full")];
    }
}

