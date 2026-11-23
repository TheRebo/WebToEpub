// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MidnightramblesParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register("midnightrambles.in", () => new MidnightramblesParser());

export class MidnightramblesParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, "span[data-ez-ph-id]");
        [...element.querySelectorAll("span")]
            .filter(s => s.id.startsWith("ezoic-"))
            .forEach(s => s.remove());
        super.removeUnwantedElementsFromContentElement(element);
    }
}

