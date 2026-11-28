// Migrated from `plugin/js/parsers/ShikkakutranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { ImageCollector } from "../../compat/legacy-image-collector.js";

/*
  parses shikkakutranslations.org
*/

parserFactory.register( "shikkakutranslations.org", () => new ShikkakutranslationsParser());

export class ShikkakutranslationsImageCollector extends ImageCollector {
    constructor() {
        super();
    }

    isImageWrapperElement(element) {
        return ((element.tagName.toLowerCase() === "div") && element.className.startsWith("gallery-group")) ||
            super.isImageWrapperElement(element);
    }
}

//==============================================================

export class ShikkakutranslationsParser extends Parser {
    constructor() {
        super(new ShikkakutranslationsImageCollector());
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("div.menu-header");
        return Promise.resolve(util.hyperlinksToChapterList(menu));
    }

    findContent(dom) {
        return dom.querySelector("div#content-body div.entry");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.page-title");
    }

    removeNextAndPreviousChapterHyperlinks(webPage, element) {
        // override default, just remove all hyperlinks
        // due to links in chapters not matching links in menu.
        [...element.querySelectorAll("a")]
            .filter(l => l.querySelector("img") === null)
            .map(l => this.findParentNodeOfChapterLinkToRemoveAt(l))
            .forEach(u => u.remove());
    }

    findParentNodeOfChapterLinkToRemoveAt(link) {
        return util.moveIfParent(link, "p");
    }
}

