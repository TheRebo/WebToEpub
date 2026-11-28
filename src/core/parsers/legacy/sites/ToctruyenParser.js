// Migrated from `plugin/js/parsers/ToctruyenParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("toctruyen.net", () => new ToctruyenParser());

export class ToctruyenParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        // eslint-disable-next-line
        let regex = new RegExp("\/truyen\/.+");
        let urlpart = dom.baseURI.match(regex)?.[0].slice(8);
        let leaves = urlpart.split("/");
        let id = leaves[0];
        let bookinfo = (await HttpClient.fetchJson("https://toctruyen.net/content/subitems?pid=" + id)).json;
        let chapters = bookinfo.data.e.map(a => ({
            sourceUrl:  a[3],
            title: a[2]  
        }));
        return chapters.reverse();
    }

    findContent(dom) {
        return dom.querySelector(".novel-reading-content .novel-reading-viewport");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".novel-reading-header h2");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".novel-header h1").textContent;
    }

    extractSubject(dom) {
        let tags = [...dom.querySelectorAll(".detail-genres a")].map(a => a.textContent.trim());
        return tags.join(", ");
    }

    extractDescription(dom) {
        return dom.querySelector("#description").textContent;
    }

    findCoverImageUrl(dom) {
        let test = dom.querySelector(".novel-thumb");
        return test.dataset.original;
    }
}

