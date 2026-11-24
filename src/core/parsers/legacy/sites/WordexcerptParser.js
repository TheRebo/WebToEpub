// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/WordexcerptParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("wordexcerpt.com", () => new WordexcerptParser());

export class WordexcerptParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("div.listing-chapters_wrap");
        return Promise.resolve(util.hyperlinksToChapterList(menu).reverse());
    }

    findContent(dom) {
        return dom.querySelector("div.reading-content div.text-left");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.post-title h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.author-content a");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }

    removeUnwantedElementsFromContentElement(element) {
        let ads = [...element.querySelectorAll("div.adsbyvli")]
            .map(e => e.parentElement)
            .filter(p => p.tagName.toUpperCase() === "CENTER");
        util.removeElements(ads);
        for (let node of util.getElements(element, "B:IF")) {
            util.flattenNode(node);
        }
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("ol.breadcrumb li.active").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.summary_image");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.summary__content p")];
    }
}

