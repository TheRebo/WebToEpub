// Migrated from `plugin/js/parsers/BookswithqianyaParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { FootnoteExtractor } from "../../compat/legacy-globals.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("bookswithqianya.com", () => new BookswithqianyaParser());

export class BookswithqianyaParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.elementor-tab-content a")]
            .map(a => util.hyperLinkToChapter(a))
            .filter(c => this.isChapterUrl(c.sourceUrl));
    }

    isChapterUrl(url) {
        return !url.includes("/products/") 
            && !url.includes("/novels/")
            && !url.includes("myrics");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".elementor-image-box-title");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "button");
        super.removeUnwantedElementsFromContentElement(element);
    }

    preprocessRawDom(webPageDom) {
        let content = this.findContent(webPageDom);
        let footnotes = new FootnoteExtractor().scriptElementsToFootnotes(webPageDom);
        this.moveFootnotes(webPageDom, content, footnotes);
    }
}

