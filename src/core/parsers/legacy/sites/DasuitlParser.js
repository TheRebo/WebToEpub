// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/DasuitlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("dasuitl.com", () => new DasuitlParser());

export class DasuitlParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".card_title");
    }    

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".wp-block-buttons");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector(".card_title");
    }
}

