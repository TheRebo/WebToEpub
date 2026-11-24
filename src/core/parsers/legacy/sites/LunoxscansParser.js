// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/LunoxscansParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { MadaraParser } from "./MadaraParser.js";

parserFactory.register("lunoxscans.com", () => new LunoxscansParser());

/**
 * Parser for http://lunoxscans.com/.
 */
export class LunoxscansParser extends MadaraParser {
    /**
     * @override
     * @param { Document } dom 
     */
    async getChapterUrls(dom) {
        /** @type { NodeListOf<HTMLAnchorElement> } */
        const found = dom.querySelectorAll("a.lunox-chapter-item:not(:has(svg.lunox-chapter-lock))");

        return Array.from(found, anchor => {
            return {
                sourceUrl: anchor.href,
                title: anchor.querySelector(".lunox-chapter-name").textContent.trim()
            };
        }).reverse();
    }

    /**
     * @override
     * @param { HTMLElement } dom 
     */
    removeUnwantedElementsFromContentElement(dom) {
        /** @type { NodeListOf<HTMLSpanElement> } */
        const suspects = dom.querySelectorAll("p:first-of-type, p:last-of-type");
        
        [...suspects]
            .filter(suspect => suspect.textContent.includes("Lunox"))
            .forEach(suspect => suspect.remove());
        super.removeUnwantedElementsFromContentElement(dom);
    }

    /**
     * @override
     * @param { Document } dom 
     */
    extractTitleImpl(dom) {
        return dom.querySelector(".post-title");
    }
}
