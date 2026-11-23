// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/CreativeNovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("creativenovels.com", () => new CreativeNovelsParser());
export class CreativeNovelsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div#chapter_list_novel_page, div.post_box a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    findContent(dom) {
        return dom.querySelector("div.entry-content.content");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeElements(element.querySelectorAll("div.team, div.x-donate-1,"+
            " div.navigation, div.navi, header.entry-header"));
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("header.entry-header h1");
    }

    findCoverImageUrl(dom) {
        let img = dom.querySelector("img.book_cover");
        return (img === null) ? util.getFirstImgSrc(dom, "header") : img.src;
    }

    makeHiddenNodesVisible(node) {
        node.removeAttribute("style");
    }
}

