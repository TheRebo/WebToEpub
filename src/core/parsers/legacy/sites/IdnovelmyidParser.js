// Migrated from `plugin/js/parsers/IdnovelmyidParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("idnovel.my.id", () => new IdnovelmyidParser());

export class IdnovelmyidParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.bxcl");
        return util.hyperlinksToChapterList(menu).reverse();
    }

    findContent(dom) {
        return dom.querySelector("div.text-left");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.infox h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "center");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.maincontent b");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.thumb");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.desc")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "script");
    }
}

