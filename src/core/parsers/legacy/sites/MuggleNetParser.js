// Migrated from `plugin/js/parsers/MuggleNetParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  Parses files on fanfiction.mugglenet.com
*/

//dead url/ parser
parserFactory.register("fanfiction.mugglenet.com", () => new MuggleNetParser());

export class MuggleNetParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let baseUrl = this.getBaseUrl(dom);
        let options = [...dom.querySelectorAll("select[name='chapter'] option")];
        if (options.length === 0) {
            // no list of chapters found, assume it's a single chapter story
            return Promise.resolve(this.singleChapterStory(baseUrl, dom));
        } else {
            return Promise.resolve(options.map(option => this.optionToChapterInfo(baseUrl, option)));
        }
    }

    optionToChapterInfo(baseUrl, optionElement) {
        // constructing the URL is a bit complicated as the value is not final part of URL.
        let chapterId = optionElement.getAttribute("value");
        let searchString = "chapter=";
        let index = baseUrl.indexOf(searchString) + searchString.length;
        let url = baseUrl.slice(0, index) + chapterId;
        return {
            sourceUrl:  url,
            title: optionElement.innerText
        };
    }

    // find the node(s) holding the story content
    findContent(dom) {
        return dom.querySelector("div#story");
    }

    extractTextFromPageTitle(dom, index) {
        let text = "<unknown>";
        let links = [...dom.querySelectorAll("div#pagetitle a")];
        if (index < links.length) {
            text = links[index].textContent.trim();
        }
        return text;
    }

    extractTitleImpl(dom) {
        return this.extractTextFromPageTitle(dom, 0);
    }

    extractAuthor(dom) {
        return this.extractTextFromPageTitle(dom, 1);
    }
}

