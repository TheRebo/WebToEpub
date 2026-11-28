// Migrated from `plugin/js/parsers/ManhwatopParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { MadaraParser } from "./MadaraParser.js";

parserFactory.register("manhwatop.com", () => new ManhwatopParser());

export class ManhwatopParser extends MadaraParser {
    constructor() {
        super();
    }

    preprocessRawDom(webPageDom) {
        util.resolveLazyLoadedImages(webPageDom, ".reading-content img");
        util.removeChildElementsMatchingSelector(webPageDom, "img[alt='ManhwaTop']");
    }
}

