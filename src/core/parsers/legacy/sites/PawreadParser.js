// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/PawreadParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("pawread.com", () => new PawreadParser());

export class PawreadParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let rootUrl = dom.baseURI;
        let items = [...dom.querySelectorAll("div.filtr-item .item-box")];
        return items.map(i => this.itemToChapter(i, rootUrl));
    }

    itemToChapter(item, rootUrl) {
        let pathTip = item.getAttribute("onclick").split("'")[1];
        return ({
            sourceUrl:  rootUrl + pathTip + ".html",
            title: item.querySelector(".c_title").textContent,
        });
    }

    findContent(dom) {
        return dom.querySelector("#chapter_item");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h3");
    }

    findCoverImageUrl(dom) {
        let div = dom.querySelector(".comic-view [style*=background-image]");
        return util.extractUrlFromBackgroundImage(div);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("p.txtDesc")];
    }
}

