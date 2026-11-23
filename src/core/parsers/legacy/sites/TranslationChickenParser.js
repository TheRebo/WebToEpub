// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/TranslationChickenParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("translationchicken.com", () => new TranslationChickenParser());

export class TranslationChickenParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    findContent(dom) {
        let content = dom.querySelector("div.post-content");
        let feature = dom.querySelector("div.featured-media");
        if (feature !== null)
        {
            feature.remove();
            content.insertBefore(feature, content.children[0]);
        }
        return content;
    }
}

