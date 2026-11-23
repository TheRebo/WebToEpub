// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/SnoutandcoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("snoutandco.ca", () => new SnoutandcoParser());

export class SnoutandcoParser extends Parser { // eslint-disable-line no-unused-vars
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.list-group");
        let chapterList = util.hyperlinksToChapterList(menu);

        // save titles to add back when fetch chapter content
        SnoutandcoParser.titles = new Map();
        chapterList.forEach(l => SnoutandcoParser.titles.set(l.sourceUrl, l.title));

        return chapterList;
    }

    findContent(dom) {
        return Parser.findConstructedContent(dom);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1#book-title");
    }

    async fetchChapter(url) {
        let params = new URL(url).searchParams;
        let folder = params.get("folder");
        let chapter = params.get("chapter");
        let contentUrl = `https://snoutandco.ca/${folder}/chapters/${chapter}`;
        let contentText = (await HttpClient.fetchText(contentUrl));
        return this.buildChapter(contentText, url);
    }

    buildChapter(contentText, url) {
        let newDoc = Parser.makeEmptyDocForContent(url);
        let title = newDoc.dom.createElement("h1");
        title.textContent = SnoutandcoParser.titles.get(url);
        newDoc.content.appendChild(title);
        Parser.addTextToChapterContent(newDoc, contentText);
        return newDoc.dom;
    }
}

