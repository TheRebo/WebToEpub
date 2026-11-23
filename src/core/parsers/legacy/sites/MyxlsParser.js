// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MyxlsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("myxls.net", () => new MyxlsParser());

export class MyxlsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let rows = dom.querySelector("div#list dl").children;
        let links = [];
        let count = 0;
        for (let row of rows) {
            let tag = row.tagName.toLowerCase();
            if (tag === "dt") {
                ++count;
            }
            if ((tag === "dd") && (count === 2)) {
                links.push(row.querySelector("a"));
            }
        }
        return links.map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".bookname h1")?.textContent ?? null;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "#fmimg");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#intro")];
    }
}

