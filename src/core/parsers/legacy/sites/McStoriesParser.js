// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/McStoriesParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  parses mcstories.com
  Notes:
  * For this to work, need to go to page with set of chapters.
*/

parserFactory.register("mcstories.com", () => new McStoriesParser());

export class McStoriesParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let chaptersElement = dom.querySelector("table#index, div.chapter");
        return Promise.resolve(util.hyperlinksToChapterList(chaptersElement));
    }

    findContent(dom) {
        return dom.querySelector("article");
    }

    extractAuthor(dom) {
        let author = dom.querySelector("article a[href*='/Authors/']");
        return (author === null) ? super.extractAuthor(dom) : author.textContent;
    }

    getInformationEpubItemChildNodes(dom) {
        return [ util.dctermsToTable(dom) ];
    }
}

