// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/GiatocvuongtaiParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { UIText } from "../../compat/legacy-globals.js";

parserFactory.register("giatocvuongtai.com", () => new GiatocvuongtaiParser());
HttpClient.blockedSites.add("giatocvuongtai.com");

export class GiatocvuongtaiParser extends Parser { // eslint-disable-line no-unused-vars
    constructor() {
        super();
    }

    disabled() {
        return UIText.Warning.parserDisabledNotification;
    }

    async getChapterUrls() {
        return [];
    }

    findContent(dom) {
        return dom.body;
    }
}

