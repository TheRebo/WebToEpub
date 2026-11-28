// Migrated from `plugin/js/parsers/NrvnqsrParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("forums.nrvnqsr.com", () => new NrvnqsrParser());

export class NrvnqsrParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("div.postlist");
        return Promise.resolve(util.hyperlinksToChapterList(menu));        
    }

    findContent(dom) {
        let postId = util.getParamFromUrl(dom.baseURI, "p");
        let selector = (postId === null) ? "div.postbody div.content" : "div#post_message_" + postId;
        return dom.querySelector(selector);
    }

    extractTitleImpl(dom) {
        return dom.querySelector("span.threadtitle");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.userinfo a.username");
        return (authorLabel === null) ? super.extractAuthor(dom) : authorLabel.textContent;
    }
}

