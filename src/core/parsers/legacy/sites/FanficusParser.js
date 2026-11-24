// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/FanficusParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("fanficus.com", () => new FanficusParser());

export class FanficusParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector(".ff-chapters-body");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return Parser.findConstructedContent(dom);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    async fetchChapter(url) {
        let path = new URL(url).pathname;
        let contentUrl = "https://fanficus-server-mirror-879c30cd977f.herokuapp.com/api/v1" + path;
        let xhr = await HttpClient.fetchJson(contentUrl);
        let doc = this.jsonToHtml(xhr.json);
        return doc;
    }
 
    jsonToHtml(json) {
        let newDoc = Parser.makeEmptyDocForContent();
        let header = newDoc.dom.createElement("h1");
        header.textContent = json.value.title;
        newDoc.content.appendChild(header);
        let doc = util.sanitize("<div id='start'>" + json.value.text + "</div>");
        newDoc.content.appendChild(doc.querySelector("div#start"));
        return newDoc.dom;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("app-post-main-info")];
    }
}

