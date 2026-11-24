// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Quanben5Parser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("quanben5.io", () => new Quanben5Parser());

export class Quanben5Parser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h3");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("span.author");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    extractLanguage() {
        return "zh";
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.pic_txt_list");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("p.description")];
    }
}

