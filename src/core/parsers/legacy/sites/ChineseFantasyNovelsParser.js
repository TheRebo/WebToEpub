// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ChineseFantasyNovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("m.chinesefantasynovels.com", () => new ChineseFantasyNovelsParser());

export class ChineseFantasyNovelsParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("dl.chapterlist");
        return Promise.resolve(util.hyperlinksToChapterList(menu).reverse());
    }

    findContent(dom) {
        return dom.querySelector("div#BookText");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("div.btitle h1");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector("div.status");
        if (authorLabel != null) {
            let textStart = "Author:";
            let  author = authorLabel.textContent;
            if (author.startsWith(textStart)) {
                return author.substring(textStart.length);
            }
        }
        return super.extractAuthor(dom);
    }

    removeUnwantedElementsFromContentElement(element) {
        for (let e of element.querySelectorAll("div.ads, div.link, div.adsb")) {
            e.remove();
        }
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("div#BookCon h1");
    }
}

