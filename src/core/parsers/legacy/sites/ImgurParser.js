// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/ImgurParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { Imgur } from "../../compat/legacy-globals.js";

/*
  parses imgur galleries
*/

parserFactory.register("imgur.com", () => new ImgurParser());

parserFactory.registerUrlRule(
    url => Imgur.isImgurHostName(util.extractHostName(url).toLowerCase()),
    () => new ImgurParser()
);

export class ImgurParser extends Parser {
    constructor() {
        super();
    }

    findContent(dom) {
        return Imgur.convertGalleryToConventionalForm(dom);
    }
}

