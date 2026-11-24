// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ExiledrebelsscanlationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("exiledrebelsscanlations.com", () => new ExiledrebelsscanlationsParser());

export class ExiledrebelsscanlationsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.lcp_catlist a")]
            .map((a) => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div#wtr-content")
            || dom.querySelector("div.entry-content");
    }

    populateUIImpl() {
        document.getElementById("removeAuthorNotesRow").hidden = false; 
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".entry-title");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".entry-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "article");
    }

    preprocessRawDom(webPageDom) {
        if (!this.userPreferences.removeAuthorNotes.value) {
            let notes = [...webPageDom.querySelectorAll("div.easy-footnote-title, ol.easy-footnotes-wrapper")];
            let content = this.findContent(webPageDom);
            this.tagAuthorNotes(notes);
            for (let e of notes) {
                content.appendChild(e);
            }
        }
    }
}

