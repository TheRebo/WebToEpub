// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/SnowyCodexParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("snowycodex.com", () => new SnowyCodexParser());

export class SnowyCodexParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.entry-content h2");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.entry-content p")];
    }
}

