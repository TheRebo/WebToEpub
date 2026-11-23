// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/KrytykalParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  parses krytykal.org
*/

parserFactory.register("krytykal.org", () => new KrytykalParser());

export class KrytykalParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("div.nav-menu");
        return Promise.resolve(util.hyperlinksToChapterList(menu));
    }

    findContent(dom) {
        return dom.querySelector("div#content article");
    }
}

