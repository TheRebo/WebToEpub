// Migrated from `plugin/js/parsers/NovelgreatParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { parserFactory } from "../../compat/legacy-factory.js";
import { NovelfullParser } from "./NovelfullParser.js";

//dead url/ parser
parserFactory.register("novelgreat.net", () => new NovelgreatParser());

export class NovelgreatParser extends NovelfullParser {
    constructor() {
        super();
    }

    getUrlsOfTocPages(dom) {
        let link = [...dom.querySelectorAll("ul.pagination li:not(.page-nav) a")].pop();
        let urls = [];
        if (link != null) {
            let limit = link.href.split("=")[1];
            limit = parseInt(limit);
            for (let i = 1; i <= limit; ++i) {
                urls.push(NovelfullParser.buildUrlForTocPage(link, i));
            }
        }
        return urls;
    }

    findContent(dom) {
        return dom.querySelector("div#chapter-c");
    }
}

