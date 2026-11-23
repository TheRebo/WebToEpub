// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NovicetranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("novicetranslations.com", () => new NovicetranslationsParser());
export class NovicetranslationsParser extends WordpressBaseParser {
    constructor() {
        super();
    }
    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.entry");
        return util.hyperlinksToChapterList(menu);
    }

    findCoverImageUrl(dom) { 
        return util.getFirstImgSrc(dom, "div.wp-block-image");
    }
}

