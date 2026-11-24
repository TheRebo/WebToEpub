// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Taffygirl13Parser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("taffygirl13.wordpress.com", () => new Taffygirl13Parser());

export class Taffygirl13Parser extends WordpressBaseParser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let tables = [...dom.querySelectorAll("div.entry-content figure table")]
            .map(table => [...table.querySelectorAll("tr")]
                .map(row => [...row.querySelectorAll("td a")])
            );
        if (tables.length == 0) {
            return super.getChapterUrls(dom);
        }

        let chapters = [];
        for (let table of tables) {
            let rhs = [];
            for (let row of table) {
                chapters.push(row[0]);
                if (row.length == 2) {
                    rhs.push(row[1]);
                }
            }
            chapters = chapters.concat(rhs);
        }
        return chapters.map(a => util.hyperLinkToChapter(a));
    }
}

