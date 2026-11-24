// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/CClawTranslationsParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";

parserFactory.register(
    "cclawtranslations.home.blog",
    () => new CClawTranslationsParser()
);

export class CClawTranslationsParser extends WordpressBaseParser {
    constructor() {
        super();
    }

    // title of the story  (not to be confused with title of each chapter)
    extractTitleImpl(dom) {
        const re = /( \(LN\))|( ToC)/g;
        // regex for removing ToC and (LN) from series title
        return dom.querySelector("h1.entry-title").innerText.replace(re, "");
    }

    // chapter title
    findChapterTitle(dom) {
        const re = /(\w.*)(?<=Volume \d )/g;
        // regex for removing series name from chapter title
        return dom.querySelector("h1.entry-title").innerText.replace(re, "");
    }

    removeUnwantedElementsFromContentElement(element) {
        super.removeUnwantedElementsFromContentElement(element);
        util.removeElements(
            [...element.querySelectorAll("p")].filter(this.hasDiscordOrPatreon)
        );
    }

    hasDiscordOrPatreon(p) {
        let links = [...p.querySelectorAll("a")]
            .map(l => l.href.toLowerCase())
            .filter(h => h.includes("discord") || h.includes("patreon"));
        return 0 < links.length || p.textContent.toLowerCase().includes("patreon");
    }
}
