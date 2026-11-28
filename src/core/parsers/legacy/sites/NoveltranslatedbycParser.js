// Migrated from `plugin/js/parsers/NoveltranslatedbycParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { BlogspotParser } from "./BlogspotParser.js";

//dead url/ parser
parserFactory.register("noveltranslatedbyc.blogspot.com", () => new NoveltranslatedbycParser());

export class NoveltranslatedbycParser extends BlogspotParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("article button")]
            .map(NoveltranslatedbycParser.buttonToChapter);
    }

    static buttonToChapter(button) {
        let onClick = button.getAttribute("onclick");
        let start = onClick.indexOf("https");
        let end = onClick.lastIndexOf("'");
        return {
            title: button.textContent.trim(),
            sourceUrl:  onClick.substring(start, end),
        };
    }

    findContent(dom) {
        return dom.querySelector("article center");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "button");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "article");
    }
}

