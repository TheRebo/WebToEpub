// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/WatashiwasugoidesuParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("watashiwasugoidesu.com", () => new WatashiwasugoidesuParser());

export class WatashiwasugoidesuParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("ul.display-posts-listing");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div#wtr-content");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#primary");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div.wp-block-media-text__content p")];
    }
}

