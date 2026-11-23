// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/VynovelParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("vynovel.com", () => new VynovelParser());

export class VynovelParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.list");
        let links = [...menu.querySelectorAll("a")];
        return this.chaptersFromList(links).reverse();
    }

    chaptersFromList(list) {
        return list.map(a => ({
            sourceUrl: a.href, 
            title: a.querySelector("span").innerText.trim()
        }));
    }

    findContent(dom) {
        return dom.querySelector(".content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("div.img-manga > img")?.src ?? null;
    }

    extractAuthor(dom) {
        let author = dom.querySelector("div.fic-header h4 span a");
        return author?.textContent?.trim() ?? super.extractAuthor(dom);
    }

    extractSubject(dom) {
        let tags = [...dom.querySelectorAll("div.div-manga a")].filter(a => a.href.includes("https://www.vynovel.com/genre"));
        return tags.map(e => e.textContent.trim()).join(", ");
    }

    extractDescription(dom) {
        return dom.querySelector("div.summary > .content").textContent.trim();
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.div-manga")];
    }
}

