// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/SpiritfanfictionParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("spiritfanfiction.com", () => new SpiritfanfictionParser());

export class SpiritfanfictionParser extends Parser {
    constructor() {
        super();
    }

    async getChapterUrls(dom) {
        let menu = dom.querySelector("table.listagemCapitulos");
        return util.hyperlinksToChapterList(menu);
    }

    findContent(dom) {
        return dom.querySelector("div.texto-capitulo");
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.tituloPrincipal");
    }

    findChapterTitle(dom) {
        return dom.querySelector("h1.tituloPrincipal");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "section.boxConteudo");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("section.boxConteudo div.texto")];
    }
}

