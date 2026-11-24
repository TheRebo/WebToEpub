// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/MtlnationParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { UIText } from "../../compat/legacy-globals.js";
import { MadaraParser } from "./MadaraParser.js";

parserFactory.register("mtlnation.com", () => new MtlnationParser());
HttpClient.blockedSites.add("mtlnation.com");

export class MtlnationParser extends MadaraParser {
    constructor() {
        super();
    }

    disabled() {
        return UIText.Warning.parserDisabledNotification;
    }

    findContent(dom) {
        if (dom.querySelector("div.reading-content") === null) {
            let content = dom.querySelector("div[data-position='footer']")?.previousElementSibling;
            if (content != null) {
                content.className = "reading-content";
            }
        }
        return super.findContent(dom);
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".code-block, #text-chapter-toolbar, [style='display:none;']");
        super.removeUnwantedElementsFromContentElement(element);
    }
}

