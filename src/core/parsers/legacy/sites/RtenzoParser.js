// Migrated from `plugin/js/parsers/RtenzoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("rtenzo.net", () => new RtenzoParser());

export class RtenzoParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let links = [...dom.querySelectorAll(".entry-content a")]
            .filter(a => a.querySelector("img") != null);
        return links.map(this.linkToChapter);
    }
    
    linkToChapter(link) {
        let path = new URL(link.href).pathname.split("/");
        let title = path[path.length - 2].replace(/-/g, " ");
        return {
            sourceUrl:  link.href,
            title: title
        };
    }

    findContent(dom) {
        return dom.querySelector(".entry-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.entry-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.entry-title");
    }
}

