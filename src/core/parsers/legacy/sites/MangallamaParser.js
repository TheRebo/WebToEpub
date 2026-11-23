// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MangallamaParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("mangallama.com", () => new MangalamaParser());

export class MangalamaParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let chaptersElement = dom.querySelector("table.table-striped");
        return Promise.resolve(util.hyperlinksToChapterList(chaptersElement).reverse());
    }

    findContent(dom) {
        return dom.querySelector("div#chapcontainer");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("div#titlecontainer").textContent;
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("img.img-thumbnail").src;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#description")];
    }
}

