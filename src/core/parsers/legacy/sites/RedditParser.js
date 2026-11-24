// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/RedditParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("reddit.com", () => new RedditParser());

export class RedditParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div.wiki a")]
            .filter(RedditParser.IsChapterLink)
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return RedditParser.getPost(dom)?.querySelector("[slot='text-body']");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".toc a");
    }

    static IsChapterLink(link) {
        let pathname = new URL(link.href).pathname;
        return pathname.startsWith("/r/HFY/comments/");
    }

    static getPost(dom) {
        return dom.querySelector("main shreddit-post");
    }

    findChapterTitle(dom) {
        return RedditParser.getPost(dom).querySelector("h1");
    }
}

