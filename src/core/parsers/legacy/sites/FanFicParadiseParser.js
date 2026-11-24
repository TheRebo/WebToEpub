// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/FanFicParadiseParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { FetchCache } from "../../compat/legacy-globals.js";

parserFactory.register("fanficparadise.com", () => new FanFicParadiseParser());

export class FanFicParadiseParser extends Parser {
    constructor() {
        super();
        this.cache = new FetchCache();
        this.minimumThrottle = 50; //182 at 20
    }

    async getChapterUrls(dom) {
        let chapters = [...dom.querySelectorAll("li.threadmarkListItem a")]
            .filter(this.isLinkToChapter);
        return chapters.map(a => util.hyperLinkToChapter(a));
    }

    isLinkToChapter(link) {
        return !link.querySelector("date")
            && !(new URL(link.href).pathname.startsWith("/awards/award"));
    }

    findContent(dom) {
        return Parser.findConstructedContent(dom);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.p-title-value");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("a.username");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    async fetchChapter(url) {
        let fetchedDom = await this.cache.fetch(url);
        let newDoc = Parser.makeEmptyDocForContent(url);
        let newUrl = new URL(url);
        let id = newUrl.hash.substring(1) || newUrl.href.substring(newUrl.href.lastIndexOf("/") + 1);
        let parent;
        if (id == "") {
            parent = fetchedDom.querySelector("li.hasThreadmark");
        } else {
            parent = fetchedDom.querySelector(`li.hasThreadmark[id='${id}']`);
        }
        this.addTitleToChapter(newDoc, parent);
        let content = parent.querySelector(".messageContent article");
        util.resolveLazyLoadedImages(content, "img.lazyload");
        newDoc.content.appendChild(content);
        return newDoc.dom;
    }

    addTitleToChapter(newDoc, parent) {
        let titleElement = parent.querySelector("span.label");
        let title = newDoc.dom.createElement("h1");
        title.textContent = titleElement.textContent.trim();
        newDoc.content.appendChild(title);
    }
}

