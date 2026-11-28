// Migrated from `plugin/js/parsers/NyahFanfictionParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("fanfiction.com.br", () => new NyahFanfictionParser());

export class NyahFanfictionParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.container_chapter_list");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div.historia");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("title");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("a.tooltip_userinfo");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#left_part");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("p.justify")];
    }
}
