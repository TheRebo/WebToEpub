// Migrated from `plugin/js/parsers/XklxswParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("m.xklxsw.net", () => new XklxswParser());

export class XklxswParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("#allChapters2");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#nr");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".cover h2 a");
    }
    findChapterTitle(dom) {
        return dom.querySelector("#nr_title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".cover");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".intro_info")];
    }
}

