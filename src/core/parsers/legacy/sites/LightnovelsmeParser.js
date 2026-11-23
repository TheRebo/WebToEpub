// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/LightnovelsmeParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

//dead url/ parser
parserFactory.register("lightnovels.me", () => new LightnovelsmeParser());
//dead url
parserFactory.register("pandapama.com", () => new LightnovelsmeParser());
//dead url
parserFactory.register("lightnovels.live", () => new LightnovelsmeParser());

export class LightnovelsmeParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.chapter-list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div.chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "main");
    }

    getInformationEpubItemChildNodes(dom) {
        return [dom.querySelector("main div.overflow-hidden")];
    }
}

