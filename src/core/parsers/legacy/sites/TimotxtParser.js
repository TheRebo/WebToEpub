// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/TimotxtParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("timotxt.com", () => new TimotxtParser());

export class TimotxtParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocUrl = dom.baseURI + "dir";
        let tocDom =  (await HttpClient.fetchHtml(tocUrl)).responseXML;
        let menu = tocDom.querySelector("ul.all");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector(".chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    extractAuthor(dom) {
        return dom.querySelector("#detail span.author")?.textContent ?? super.extractAuthor(dom);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "#detail");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".intro")];
    }
}

