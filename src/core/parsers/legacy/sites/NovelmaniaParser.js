// Migrated from `plugin/js/parsers/NovelmaniaParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("novelmania.com.br", () => new NovelmaniaParser());

export class NovelmaniaParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let links = [...dom.querySelectorAll("ol.list-inline a")];
        for (let link of links) {
            link.querySelector("small")?.remove();
        }
        return links.map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div#chapter-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    extractAuthor(dom) {
        let author = dom.querySelector("span.authors");
        author?.querySelector("b")?.remove();
        return author?.textContent ?? super.extractAuthor(dom);
    }

    extractLanguage() {
        return "pt";
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.novel-img");
    }

    getInformationEpubItemChildNodes(dom) {
        return [dom.querySelector("div.text")];
    }
}

