// Migrated from `plugin/js/parsers/ErofusParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { ImageCollector } from "../../compat/legacy-image-collector.js";

parserFactory.register("erofus.com", () => new ErofusParser());

export class ErofusParserImageCollector extends ImageCollector {
    constructor() {
        super();
    }

    selectImageUrlFromImagePage(dom) {
        let img = dom.querySelector("div#picture-full img");
        if (img != null)
        {
            return dom.querySelector("div#picture-full img").src;
        }
    }
}

export class ErofusParser extends Parser {
    constructor() {
        super(new ErofusParserImageCollector());
    }

    async getChapterUrls(dom) {
        return [...dom.querySelectorAll("div a div.thumbnail")]
            .map(div => util.hyperLinkToChapter(div.parentElement))
            .filter(c => !util.isNullOrEmpty(c.title));
    }

    findContent(dom) {
        return dom.querySelector("div.content");
    }

    findCoverImageUrl() {
        return null;
    }
}

