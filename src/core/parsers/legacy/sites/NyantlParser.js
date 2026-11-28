// Migrated from `plugin/js/parsers/NyantlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("nyantl.wordpress.com", () => new NyantlParser());

export class NyantlParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.wp-block-post-title");
    }
}

