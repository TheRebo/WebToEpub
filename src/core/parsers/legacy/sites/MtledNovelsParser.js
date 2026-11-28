// Migrated from `plugin/js/parsers/MtledNovelsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

//dead url/ parser
parserFactory.register("mtled-novels.com", () => new MtledNovelsParser());

export class MtledNovelsParser extends Parser {
    constructor() {
        super();
    }

    populateUIImpl() {
        document.getElementById("removeOriginalRow").hidden = false;
    }

    getChapterUrls(dom) {
        let chapters = [...dom.querySelectorAll("div.card__body a:not(.list-group-item)")]
            .map(a => util.hyperLinkToChapter(a));
        return Promise.resolve(chapters);
    }

    findContent(dom) {
        return dom.querySelector("div.text_content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    customRawDomToContentStep(chapter, content) {
        if (this.userPreferences.removeOriginal.value) {
            util.removeChildElementsMatchingSelector(content, "div[id='raw']");
        } 
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.profile__img");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.profile__info")];
    }
}

