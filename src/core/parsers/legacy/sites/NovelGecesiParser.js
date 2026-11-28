// Migrated from `plugin/js/parsers/NovelGecesiParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { HttpClient } from "../../compat/legacy-http-client.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("novelgecesi.com", () => new NovelGecesiParser());

export class NovelGecesiParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 500;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h1.series-title");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "button#series-cover-trigger");
    }

    extractLanguage() {
        return "tr";
    }

    findContent(dom) {
        return dom.querySelector("div#reader-content");
    }

    async getChapterUrls(dom) {
        let slug = this.extractSlug(dom);
        let response = await HttpClient.fetchJson(
            `https://www.novelgecesi.com/api/series/${slug}/chapters`
        );
        let chapters = response.json.chapters;

        return chapters.map((chapter) => {
            let title = chapter.title
                ? `Bölüm ${chapter.chapter} - ${chapter.title}`
                : `Bölüm ${chapter.chapter}`;
            return {
                sourceUrl: "https://www.novelgecesi.com" + chapter.url,
                title: title
            };
        });
    }

    extractSlug(dom) {
        let match = dom.baseURI.match(/novelgecesi\.com\/([^/?#]+)/);
        return match ? match[1] : "";
    }
}
