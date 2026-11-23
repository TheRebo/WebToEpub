// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/QuanbenParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("quanben.io", () => new QuanbenParser());

export class QuanbenParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        if (!dom.baseURI.endsWith("/list.html")) {
            let tocUrl = dom.baseURI + "/list.html";
            dom = (await HttpClient.wrapFetch(tocUrl)).responseXML;
        }
        return [...dom.querySelectorAll("div.box li a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div#content");
    }

    extractTitleImpl(dom) {
        let span = dom.querySelector("span[itemprop='name']");
        return span === null ? null : span.textContent;
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.headline");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div[itemscope]");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.description")];
    }
}

