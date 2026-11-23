// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ShinningnoveltranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { RoyalRoadParser } from "./RoyalRoadParser.js";

parserFactory.register("shinningnoveltranslations.com", () => new ShinningnoveltranslationsParser());

export class ShinningnoveltranslationsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let all = [...dom.querySelectorAll(".entry-content p")];
        let chapters = [];
        let isfree = false;
        for (let i = 0; i < all.length; i++) {
            if (all[i].textContent == "Free") {
                isfree = true;
            }
            let ret = all[i].firstChild;
            if (ret?.href?.includes("shinningnoveltranslations.com")) {
                chapters.push({
                    sourceUrl: ret.href, 
                    title: ret.textContent,
                    isIncludeable: isfree
                });
            }
        }
        return chapters.reverse();
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".wp-block-post-title")?.textContent ?? null;
    }

    findCoverImageUrl(dom) {
        return dom.querySelector(".wp-block-image > img")?.src ?? null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".entry-content")];
    }

    findContent(dom) {
        return dom.querySelector(".entry-content");
    }

    removeNextAndPreviousChapterHyperlinks(webPage, content) {
        util.removeElements(content.querySelectorAll(".wp-block-columns"));
        RoyalRoadParser.removeOlderChapterNavJunk(content);
    }
}
