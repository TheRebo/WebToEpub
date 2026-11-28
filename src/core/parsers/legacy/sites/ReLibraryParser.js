// Migrated from `plugin/js/parsers/ReLibraryParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("re-library.com", () => new ReLibraryParser());

export class ReLibraryParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.su-accordion div.su-spoiler-content li a:not(:has(>span.rl-unlock-text))")]
            .map(a => util.hyperLinkToChapter(a));
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#synopsis+div div.su-box-content")];
    }
}

