// Migrated from `plugin/js/parsers/AdultfanfictionParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.registerRule(
    (url) => AdultfanfictionParser.isAdultFanFiction(url) * 0.9,
    () => new AdultfanfictionParser()
);

export class AdultfanfictionParser extends Parser {
    constructor() {
        super();
    }

    static isAdultFanFiction(url) {
        return (util.extractHostName(url).indexOf(".adult-fanfiction.org") != -1);
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul#dropdown1");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("#contentdata");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h4");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "ul#dropdown1, a.dropdown-trigger, ul.pagination");
        super.removeUnwantedElementsFromContentElement(element);
    }
}

