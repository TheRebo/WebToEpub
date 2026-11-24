// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/WanderinginnParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("wanderinginn.com", () => new WanderinginnParser());

export class WanderinginnParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("#table-of-contents a:not(.book-title-num, .volume-book-card)")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div#reader-content");
    }

    findChapterTitle(dom) {
        const titles = [...dom.querySelectorAll("div.post h2.elementor-heading-title, div#reader-content")];
        let previous = null;
        for (const title of titles) {
            if (title.id === "reader-content") {
                return previous?.textContent?.trim();
            }
            previous = title;
        }
        return null;
    }
    
    extractTitleImpl() {
        return "The Wandering Inn";
    }
    
    extractAuthor() {
        return "pirateaba";
    }
    
    removeNextAndPreviousChapterHyperlinks(webPage, content) {
        util.removeElements(content.querySelectorAll("a[href*='https://wanderinginn.com/']"));
    }

    preprocessRawDom(webPageDom) {
        const content = this.findContent(webPageDom);
        if (content) {
            // Add italics to all .mrsha-write elements
            // "mrsha-write" used to be italics, but is now is a custom font in the
            // web reader which doesn't get copied over to the epub. This fixes that.
            for (const element of content.querySelectorAll(".mrsha-write")) {
                element.setAttribute("style", "font-style: italic;");
            }

            // Add iBooks dark theme class to spans with color styles
            // This allows apple iBooks to display colors in dark mode, for specific elements.
            // The Wandering Inn colors were already meant to be displayed in dark mode, so this works great!
            for (const span of content.querySelectorAll("span[style*='color:']")) {
                span.classList.add("ibooks-dark-theme-use-custom-text-color");
            }
        }
    }
}

