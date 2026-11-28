// Migrated from `plugin/js/parsers/AsianfanficsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("asianfanfics.com", () => new AsianfanficsParser());

export class AsianfanficsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("aside ul");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div#user-submitted-body");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1#story-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1#chapter-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#bodyText");
    }

    async fetchChapter(url) {
        let dom = (await HttpClient.fetchHtml(url)).responseXML;
        let postApi = this.findPostApi(dom);
        if (!util.isNullOrEmpty(postApi)) {
            let restUrl = "https://www.asianfanfics.com" + postApi;
            let json = (await HttpClient.fetchJson(restUrl)).json;
            if (!json.post) {
                json = (await HttpClient.fetchJson(restUrl + "?v=1")).json;                
            }
            this.addJsonToContent(json, dom);
        }
        return dom;
    }

    findPostApi(dom) {
        return [...dom.querySelectorAll("script")]
            .filter(s => s.textContent.startsWith("var postApi"))
            .map(s => s.textContent.split("\"")[1])[0];
    }

    addJsonToContent(json, dom) {
        let content = this.findContent(dom);
        let post = util.sanitize("<div>" + json.post + "</div>")
            .querySelector("div");
        content.append(post);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#story-description, #story-foreword")];
    }
}

