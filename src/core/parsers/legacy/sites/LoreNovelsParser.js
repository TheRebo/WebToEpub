// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/LoreNovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("lorenovels.com", () => new LoreNovelsParser());

export class LoreNovelsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        const toc = dom.querySelector("ul.wp-block-latest-posts__list");
        if (!toc) {
            return [];
        }

        const items = [...toc.querySelectorAll(
            "a.wp-block-latest-posts__post-title"
        )];

        return this.buildChapterList(items);
    }

    buildChapterList(items) {
        return items
            .reverse() // newest → oldest → reading order
            .map(a => ({
                sourceUrl: a.href,
                title: a.textContent.trim()
            }));
    }

    findContent(dom) {
        return dom.querySelector("div.entry-content.wp-block-post-content");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeElements(
            element.querySelectorAll(
                "div.wp-block-buttons"
            )
        );
    }
}
