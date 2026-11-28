// Migrated from `plugin/js/parsers/RebirthOnline.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("www.rebirth.online", () => new RebirthOnlineParser());

export class RebirthOnlineParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menu = dom.querySelector("div.table_of_content");
        return Promise.resolve(util.hyperlinksToChapterList(menu));
    }

    findContent(dom) {
        return dom.querySelector(".entry-content");
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".entry-title a");
    }

    findChapterTitle(dom) {
        return dom.querySelector(".chapter-title");
    }

    customRawDomToContentStep(webPage, content) {
        const styles = Array.from(webPage.rawDom.querySelectorAll("head style")).filter(s => s.textContent.trim());
        const classes = [];
        styles.forEach(s => {
            const re = /(\.[a-zA-Z0-9]+)/g;
            const t = s.textContent;
            if (!~t.indexOf("-999")) return;
            let c;
            while ((c = re.exec(t)) != null) {
                classes.push(...c);
            }
        });
        classes.filter((v,i,a) => a.indexOf(v)===i).forEach(c => {
            content.querySelectorAll(c).forEach(n => n.remove());
        });
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll(".entry-title, div.entry-content p")];
    }
}

