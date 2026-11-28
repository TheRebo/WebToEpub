// Migrated from `plugin/js/parsers/NanodesuParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  parses nanodesu
*/

// nanodesu URLs have hostnames like '*thetranslation.wordpress.com'
parserFactory.registerUrlRule(
    url => util.extractHostName(url).endsWith("thetranslation.wordpress.com"), 
    () => new NanodesuParser()
);

export class NanodesuParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("ul#nav");
        return Promise.resolve(util.hyperlinksToChapterList(menu));
    }

    findContent(dom) {
        return dom.querySelector("div.page-body");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h2.page-title");
    }

    findParentNodeOfChapterLinkToRemoveAt(link) {
        return util.moveIfParent(link, "p");
    }
}

