// Migrated from `plugin/js/parsers/HellpingParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

/*
  parses hellping.org
*/

//dead url/ parser
parserFactory.register("hellping.org", () => new HellpingParser());

export class HellpingParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tocEntries = [...dom.querySelectorAll("div.entry-content a")]
            .filter(a => a.textContent.trim() !== "");
        let menuEntries = [...dom.querySelectorAll("#primary-menu a")];
        return tocEntries.concat(menuEntries)
            .map(a => util.hyperLinkToChapter(a));
    }
}

