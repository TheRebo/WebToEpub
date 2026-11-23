// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Marx2maoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("marx2mao.com", () => new Marx2maoParser());

export class Marx2maoParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = this.findContent(dom);
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("body");
    }
}

