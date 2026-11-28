// Migrated from `plugin/js/parsers/ManhwadenParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { MadaraParser } from "./MadaraParser.js";

parserFactory.register("manhwaden.com", () => new ManhwadenParser());

export class ManhwadenParser extends MadaraParser {
    constructor() {
        super();
    }

    preprocessRawDom(webPageDom) {
        util.removeChildElementsMatchingSelector(webPageDom, "img:not([src])");
    }
}

