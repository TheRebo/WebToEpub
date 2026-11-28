// Migrated from `plugin/js/parsers/Kanunu8Parser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("kanunu8.com", () => new Kanunu8Parser());

export class Kanunu8Parser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector(".mulu-list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#neirong");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".catalog h1");
    }

    extractAuthor(dom) {
        let author = dom.querySelector(".catalog .info");
        if (author) {
            return author.textContent.replace(/^作者：/, "").trim();
        }
        return super.extractAuthor(dom);
    }

    extractLanguage() {
        return "zh";
    }

    extractDescription(dom) {
        let description = dom.querySelector(".intro");
        return description ? description.textContent.trim() : "";
    }

    async fetchChapter(url) {
        let options = {
            makeTextDecoder: () => new TextDecoder("gbk")
        };
        return (await HttpClient.wrapFetch(url, options)).responseXML;
    }
}

