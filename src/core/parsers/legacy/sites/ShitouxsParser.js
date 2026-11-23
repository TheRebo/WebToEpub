// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ShitouxsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("shitouxs.com", () => new ShitouxsParser());

export class ShitouxsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("#listsss");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#TextContent");
    }

    findChapterTitle(dom) {
        return dom.querySelector("#mlfy_main_text > h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".bookcover");
    }

    extractLanguage(dom) {
        return dom.querySelector("html").getAttribute("lang");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector(".red");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".bookintromore")];
    }
}
