// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/IdleturtletranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("idleturtle-translations.com", () => new IdleturtletranslationsParser());

export class IdleturtletranslationsParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("div.pt-cv-wrapper");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div[itemprop='articleBody']");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("article h3");
    }

    findChapterTitle(dom) {
        return dom.querySelector("article h1");
    }

    preprocessRawDom(webPageDom) {
        let content = this.findContent(webPageDom);
        let footnotes = new FootnoteExtractor().scriptElementsToFootnotes(webPageDom);
        this.moveFootnotes(webPageDom, content, footnotes);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "article");
    }
}

