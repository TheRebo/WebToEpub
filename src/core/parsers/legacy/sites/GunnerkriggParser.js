// Migrated from `plugin/js/parsers/GunnerkriggParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("gunnerkrigg.com", () => new GunnerkriggParser());

export class GunnerkriggParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("select[name='page'] option")]
            .map(this.optionToChapter);
    }

    optionToChapter(option) {
        return {
            sourceUrl:  "https://www.gunnerkrigg.com/?p=" + option.value,
            title: option.textContent.trim(),
        };
    }

    findContent(dom) {
        let content = dom.querySelector("div.comic");
        if (content !== null) {
            util.removeChildElementsMatchingSelector(content, ".nav, .extra");
        }
        return content;
    }
}

