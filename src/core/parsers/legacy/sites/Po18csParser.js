// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/Po18csParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("po18cs.com", () => new Po18csParser());

export class Po18csParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        let menu = [...dom.querySelectorAll("dd.col-md-3")];

        let chapters = [];
        let prevChapUrl = null;

        for (let el of menu) {
            let anchor = el.querySelector("a");

            let chapter = null;

            if (anchor) {
                prevChapUrl = anchor.href;

                chapter = {
                    sourceUrl: anchor.href,
                    title: el.textContent.trim(),
                    isIncludeable: true,
                };

                chapters.push(chapter);

                chapterUrlsUI.showTocProgress([chapter]);

                continue;
            }

            //Handle missing chapter link in toc
            await this.rateLimitDelay();
            let options = { parser: this };
            let prevChapDom = (await HttpClient.wrapFetch(prevChapUrl, options)).responseXML; 

            let nextChapAnchor = prevChapDom.querySelector("#linkNext");

            prevChapUrl = nextChapAnchor.href;

            chapter = {
                sourceUrl: nextChapAnchor.href,
                title: el.textContent.trim(),
                isIncludeable: true,
            };

            chapters.push(chapter);
            
            chapterUrlsUI.monoShowTocProgress(chapter);
        }

        return chapters;
    }

    findContent(dom) {
        return dom.querySelector("#htmlContent");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".bookTitle");
    }

    extractAuthor(dom) {
        let authorLabel = dom.querySelector(".red");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    extractLanguage() {
        return "zh";
    }

    extractDescription(dom) {
        return dom.querySelector("#bookIntro").textContent.trim();
    }

    extractPublisher() {
        return "po18";
    }

    findChapterTitle(dom) {
        return dom.querySelector(".readTitle");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, ".col-md-2");
    }

    async fetchChapter(url) {
        let options = { 
            parser: this,
            makeTextDecoder: () => new TextDecoder("gbk"),
        };
        return (await HttpClient.wrapFetch(url, options)).responseXML;
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("#bookIntro")];
    }
}

