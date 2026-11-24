// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/LightnovelfrParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("lightnovelfr.com", () => new LightnovelfrParser());

export class LightnovelfrParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll(".eplister a")]
            .map(this.linkToChapter)
            .reverse();
    }

    linkToChapter(link) {
        return ({
            sourceUrl:  link.href,
            title: link.querySelector(".epl-num").textContent + " " + link.querySelector(".epl-title").textContent
        });
    }

    findContent(dom) {
        return dom.querySelector(".entry-content")
            || dom.querySelector(".postbody");
    }

    findChapterTitle(dom) {
        let epheader = dom.querySelector(".epheader");
        if (epheader !== null) {
            let h1 = epheader.querySelector("h1");
            let cat = epheader.querySelector(".cat-series");
            return h1.textContent + " " + cat.textContent;
        }
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".sertothumb");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".sersys")];
    }
}

