// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MtlnovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("mtlnovels.com", () => new MtlnovelsParser());
parserFactory.register("mtlnovel.com", () => new MtlnovelsParser());
parserFactory.registerUrlRule(
    url => (util.extractHostName(url).endsWith(".mtlnovels.com")),
    () => new MtlnovelsParser()
);
parserFactory.registerUrlRule(
    url => (util.extractHostName(url).endsWith(".mtlnovel.com")),
    () => new MtlnovelsParser()
);

export class MtlnovelsParser extends Parser {
    constructor() {
        super();
    }

    populateUIImpl() {
        document.getElementById("removeOriginalRow").hidden = false;
    }

    async getChapterUrls(dom) {
        const tocUrl = dom.querySelector("#panelchapterlist > a").href;

        const chapterDom = (await HttpClient.fetchHtml(tocUrl)).responseXML;

        return [...chapterDom.querySelectorAll(".ch-list > p > a")]
            .map(a => ({
                title: a.textContent.trim(),
                sourceUrl: a.href
            }))
            .reverse();
    }

    findContent(dom) {
        return dom.querySelector("div.single-page");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".entry-title");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("#author");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    removeUnwantedElementsFromContentElement(element) {
        let original = "";
        if (this.userPreferences.removeOriginal.value) {
            original = ", p.cn";
        }
        util.removeChildElementsMatchingSelector(element, ".crumbs, .chapter-nav, .lang-btn, .sharer," +
            " amp-embed, .link-title, ol.link-box, a.view-more, button, span[hidden]" + original);
        for (let e of [...element.querySelectorAll("div")]) {
            e.removeAttribute("[class]");
        }
        super.removeUnwantedElementsFromContentElement(element);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#panelnovelinfo div.desc")];
    }
}

