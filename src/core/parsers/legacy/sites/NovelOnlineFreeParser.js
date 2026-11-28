// Migrated from `plugin/js/parsers/NovelOnlineFreeParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

/*
  Parser for http://novelonlinefree.com/
*/

parserFactory.register("novelonlinefree.com", () => new NovelOnlineFreeParser());
//dead url
parserFactory.register("novelonlinefree.info", () => new NovelOnlineFreeParser());
parserFactory.register("novelonlinefull.com", () => new NovelOnlineFreeParser());
parserFactory.register("wuxiaworld.online", () => new NovelOnlineFreeParser());
//dead url
parserFactory.register("chinesewuxia.world", () => new NovelOnlineFreeParser());
parserFactory.register("bestlightnovel.com", () => new NovelOnlineFreeParser());
//dead url
parserFactory.register("wuxia-world.online", () => new NovelOnlineFreeParser());
parserFactory.register("wuxiaworld.live", () => new NovelOnlineFreeParser());

export class NovelOnlineFreeParser extends Parser {
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        let menuItems = [...dom.querySelectorAll("div.chapter-list a")];
        return Promise.resolve(this.buildChapterList(menuItems));
    }

    buildChapterList(menuItems) {
        return menuItems.reverse().map(
            a => ({sourceUrl: a.href, title: a.getAttribute("title")})
        );
    }
    
    findContent(dom) {
        let content = dom.querySelector("div.vung_doc")
          || dom.querySelector("div.content-area");
        return content;
    }

    // title of the story
    extractTitleImpl(dom) {
        return dom.querySelector("h1");
    }

    extractAuthor(dom) {
        let link = dom.querySelector("a[href*='search_author']");
        return (link == null) ? super.extractAuthor(dom) : link.textContent;
    }

    // individual chapter titles are not inside the content element
    findChapterTitle(dom) {
        return dom.querySelector("h1");
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.entry-header");
    }

    getInformationEpubItemChildNodes(dom) {
        return [...dom.querySelectorAll("div#noidungm, ul.truyen_info_right")];
    }

    cleanInformationNode(node) {
        util.removeChildElementsMatchingSelector(node, "span.rate_star, .fb_iframe_widget, div.google, button, script");
    }
}

