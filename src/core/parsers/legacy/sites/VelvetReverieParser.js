// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/VelvetReverieParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { UIText } from "../../compat/legacy-globals.js";

parserFactory.register("velvet-reverie.org", () => new VelvetReverieParser());
HttpClient.blockedSites.add("velvet-reverie.org");

export class VelvetReverieParser extends Parser {
    constructor() {
        super();
    }
    
    disabled() {
        return UIText.Warning.parserDisabledNotification;
    }

    async getChapterUrls(dom) {
        let table = dom.querySelector("div.story-toc ul");
        return util.hyperlinksToChapterList(table);
    }

    findContent(dom) {
        let temp = dom.querySelector("div.mbs_posts_text");
        let ToRemove = temp.querySelectorAll(".jum"); 
        for (let element of ToRemove) {
            element.remove();
        }
        return temp;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.story-info-column h1");
    }

    extractDescription(dom) {
        let temp = dom.querySelector("div.story-synopsis");
        let ToRemove = temp.querySelectorAll(".jum"); 
        for (let element of ToRemove) {
            element.remove();
        }
        return temp.textContent.trim();
    }

    findChapterTitle(dom) {
        return dom.querySelector("h2.mbs_posts_title");
    }

    findCoverImageUrl(dom) {
        return dom.querySelector("img.story-cover")?.src ?? null;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.story-synopsis p")];
    }
}

