// Migrated from `plugin/js/parsers/AsstrParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("asstr.org", () => new AsstrParser());

export class AsstrParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("body tbody");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("body pre");
    }

    extractTitleImpl(dom) {
        return [...dom.querySelectorAll("h1")].pop();
    }

    customRawDomToContentStep(chapter, content) {
        if (content.tagName.toLowerCase() === "pre") {
            util.convertPreTagToPTags(chapter.rawDom, content, "\n\n");
        }
    }
}

