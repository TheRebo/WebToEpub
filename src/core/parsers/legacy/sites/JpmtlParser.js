// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/JpmtlParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

//dead url/ parser
parserFactory.register("jpmtl.com", () => new JpmtlParser());

export class JpmtlParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let chapters = [...dom.querySelectorAll("a.book-ccontent__content")];
        return chapters.map(this.linkToChapter);
    }

    linkToChapter(link) {
        let chapterNum = link.querySelector("div.book-ccontent__index").textContent;
        let titleText = link.querySelector("div.book-ccontent__title").textContent;
        return {
            sourceUrl:  link.href,
            title: `${chapterNum}: ${titleText}`,
            newArc: null
        };
    }

    findContent(dom) {
        return dom.querySelector("div.chapter-content__content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.book-sidebar__title");
    }

    removeUnwantedElementsFromContentElement(element) {
        [...element.querySelectorAll("p")]
            .filter(p => p.textContent.includes("This novel has been translated by JPMTL.com"))
            .forEach(p => p.remove());
        [...element.querySelectorAll("p")]
            .forEach(this.removeWatermark);
        super.removeUnwantedElementsFromContentElement(element);
    }

    removeWatermark(paragraph) {
        let text = paragraph.textContent.substring(0, 80).toLowerCase();
        let index = text.indexOf("y");
        if (index === -1 ) {
            return;
        }
        let watermark = text.substring(0, index + 1).replace(/\s+/g, "");
        const watermarkLength = 21;
        if (watermark === "translatedby") {
            let count = 12;
            while (index < text.length) {
                if (text[++index] !== " ") {
                    if (++count === watermarkLength) {
                        paragraph.textContent = paragraph.textContent.substring(index + 1);
                        return;
                    }
                }
            }
        }
    }

    findChapterTitle(dom) {
        return dom.querySelector("div.chapter-content__title").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.book-sidebar__cover");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.main-book__container")];
    }

    cleanInformationNode(node) {
        [...node.querySelectorAll("svg")]
            .forEach(p => p.remove());
        return node;
    }
}

