// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MoonQuillParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { main } from "../../compat/legacy-globals.js";

parserFactory.register("moonquill.com", () => new MoonqQillParser());

export class MoonqQillParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div#toc div.card-body div.col-1")]
            .map(d => MoonqQillParser.divToChapter(d));
    }

    static divToChapter(div) {
        let link = div.querySelector("a");
        let title = div.nextElementSibling.querySelector("a").textContent.trim();
        return {
            sourceUrl:  link.href,
            title: link.textContent.trim().replace("#", "") + ": " + title,
            newArc: null
        };
    }

    findContent(dom) {
        return dom.querySelector("div#content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.card-header-title");
    }

    customRawDomToContentStep(chapter, content) {
        this.uncommentStoryText(content);
    }

    uncommentStoryText(content) {
        let comments = [...content.childNodes].filter(n => n.nodeType === Node.COMMENT_NODE);
        for (let comment of comments) {
            let newDom = util.sanitize("<article>" + comment.data + "</article>");
            let newHtml = newDom.querySelector("article");
            content.appendChild(newHtml);
            break;
        }
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.main-content");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#syn div.card-body")];
    }
}

