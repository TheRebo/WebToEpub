// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/SspaiParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  Very basic parser for sspai.com
*/

parserFactory.register("sspai.com", () => new SspaiParser());

export class SspaiParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("body");
        return Promise.resolve(util.hyperlinksToChapterList(menu));        
    }

    findContent(dom) {
        return dom.querySelector("div.wangEditor-txt");
    }
}

