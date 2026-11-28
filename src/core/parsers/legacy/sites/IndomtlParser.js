// Migrated from `plugin/js/parsers/IndomtlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("indomtl.com", () => new IndomtlParser());

export class IndomtlParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let links = [...dom.querySelectorAll("div#panelchapterlist div[role='list'] a")];
        return links.map(IndomtlParser.linkToChapter).reverse();
    }

    static linkToChapter(link) {
        util.removeChildElementsMatchingSelector(link, "span.time");
        return util.hyperLinkToChapter(link);
    }

    findContent(dom) {
        return dom.querySelector("article");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "amp-ad, p.china, .pub-date, .chapter-nav, .snpconainer, .overlay");
        super.removeUnwantedElementsFromContentElement(element);
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.info")];
    }
}

