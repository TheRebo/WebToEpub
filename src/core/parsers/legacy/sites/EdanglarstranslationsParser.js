// Migrated from `plugin/js/parsers/EdanglarstranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("edanglarstranslations.com", () => new EdanglarstranslationsParser());

export class EdanglarstranslationsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("article a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("article div[property='schema:text']");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("p")];
    }
}

