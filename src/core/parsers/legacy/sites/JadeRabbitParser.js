// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/JadeRabbitParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("jade-rabbit.net", () => new JadeRabbitParser());

export class JadeRabbitParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        return this.walkTocPages(dom, 
            JadeRabbitParser.chaptersFromDom, 
            JadeRabbitParser.nextTocPageUrl, 
            chapterUrlsUI
        );
    }

    static chaptersFromDom(dom) {
        return [...dom.querySelectorAll("h2.entry-title a")]
            .map(a => util.hyperLinkToChapter(a));
    }

    static nextTocPageUrl(dom) {
        let link = dom.querySelector("div.older a");
        return link === null ? null : link.href;
    }

    findContent(dom) {
        return dom.querySelector("div.post-entry");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "div.wp-block-ugb-container, "
            + "div.wp-block-uagb-buttons, div.notranslate, div.post-tags");
        super.removeUnwantedElementsFromContentElement(element);
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.entry-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.post-img");
    }

    getInformationEpubItemChildNodes(dom) {
        let summary = dom.querySelector("div.post-entry");
        return summary === null ? [] : [summary];
    }
}

