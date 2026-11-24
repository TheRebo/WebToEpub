// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/NameVtParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("namevt.com", () => new NameVtParser());

export class NameVtParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 500;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.entry-title");
    }

    extractAuthor(dom) {
        let authorRow = Array.from(dom.querySelectorAll("div.serl")).find(
            (row) => row.querySelector(".sername")?.textContent.trim() === "Yazar"
        );
        let authorLink = authorRow?.querySelector(".serval a");
        return authorLink ? authorLink.textContent.trim() : super.extractAuthor(dom);
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.sertothumb");
    }

    extractLanguage() {
        return "tr";
    }

    findContent(dom) {
        return dom.querySelector("div.nvtread.epcontent.entry-content");
    }

    removeUnwantedElementsFromContentElement(element) {
        super.removeUnwantedElementsFromContentElement(element);
        let titleHeading = element.querySelector(":scope > h2");
        if (titleHeading) {
            titleHeading.remove();
        }
    }

    getChapterUrls(dom) {
        let chapterLinks = dom.querySelectorAll(
            "div.ts-chl-collapsible-content ul li a"
        );
        let chapters = Array.from(chapterLinks).map((link) => {
            let number = link.querySelector(".epl-num")?.textContent.trim() ?? "";
            let title = link.querySelector(".epl-title")?.textContent.trim() ?? "";
            return {
                sourceUrl: link.href,
                title: title ? `${number} - ${title}` : number
            };
        });

        
        return chapters.reverse();
    }
}
