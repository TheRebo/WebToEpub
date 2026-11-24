// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/UnlimitedNovelFailuresParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { WordpressBaseParser } from "./WordpressBaseParser.js";
import { BakaTsukiParser } from "./BakaTsukiParser.js";

/*
  Parses unlimitednovelfailures.mangamatters.com
*/

//dead url/ parser
parserFactory.register("unlimitednovelfailures.mangamatters.com", 
    () => new UnlimitedNovelFailuresParser()
);

export class UnlimitedNovelFailuresParser extends Parser {
    constructor(imageCollector) {
        super(imageCollector);
    }

    getChapterUrls(dom) {
        return Promise.resolve(util.hyperlinksToChapterList(dom));
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".entry-title");
    }

    // find the node(s) holding the story content
    findContent(dom) {
        return WordpressBaseParser.findContentElement(dom);
    }

    findChapterTitle(dom) {
        return dom.querySelector(".entry-title");
    }

    webPageToEpubItems(webPage, epubItemIndex) {
        let content = this.convertRawDomToContent(webPage);
        let items = [];
        if (content != null) {
            items = this.splitContentIntoEpubItems(content, webPage.sourceUrl, epubItemIndex);
        }
        BakaTsukiParser.fixupInternalHyperLinks(items);
        return items;
    }

    splitContentIntoEpubItems(content, baseUri, epubItemIndex) {
        this.convertAnchorsToHeaders(content);
        let items = BakaTsukiParser.splitContentOnHeadingTags(content);
        return BakaTsukiParser.itemsToEpubItems(items, epubItemIndex, baseUri);
    }

    convertAnchorsToHeaders(content) {
        let document = content.ownerDocument;
        for (let link of content.querySelectorAll("a[id]")) {
            let h2 = document.createElement("h2");
            h2.id = link.id;
            h2.appendChild(document.createTextNode(link.textContent));
            let parent = link.parentElement;
            if (parent.tagName.toLowerCase() === "p") {
                parent.after(h2);
                link.remove();
            } else {
                link.replaceWith(h2);
            }
        }
    }
}

