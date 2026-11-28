// Migrated from `plugin/js/parsers/SystemTranslationParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("systemtranslation.com", () => new SystemTranslationParser());

export class SystemTranslationParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.eplisterfull ul");
        return util.hyperlinksToChapterList(menu).reverse();
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.thumb");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "p.has-text-align-center");
        super.removeUnwantedElementsFromContentElement(element);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.entry-content p:not(.has-text-align-center)")];
    }
}

