// Migrated from `plugin/js/parsers/SonakoParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";
import { ImageCollector } from "../../compat/legacy-image-collector.js";
import { BakaTsukiImageCollector, BakaTsukiParser } from "./BakaTsukiParser.js";

/*
  Parses files on sonako.org
*/

parserFactory.register("sonako.wikia.com", () => new SonakoParser());
parserFactory.register("sonako.fandom.com", () => new SonakoParser());

//-----------------------------------------------------------------------------
// class SonakoImageCollector  (derives from ImageCollector)
//-----------------------------------------------------------------------------

export class SonakoImageCollector extends BakaTsukiImageCollector {
    constructor() {
        super();
    }

    //  Assume all images can be found on a web page with URL
    //  http://sonako.wikia.com/wiki/File:{data-image-name}
    //  where {data-image-name} is data-image-name element of the img tag.
    //
    extractWrappingUrl(element) {
        let tagName = element.tagName.toLowerCase();
        if (tagName === "a") {
            return element.href;
        }
        let link = element.querySelector("a");
        if (link !== null) {
            return link.href;
        }
        let img = (tagName === "img") ? element : element.querySelector("img");
        let dataImageName = img.getAttribute("data-image-name");

        // ToDo, use utilresolveRelativeUrl() rather than string concatanation
        return (dataImageName === null) ? img.src : "http://sonako.wikia.com/wiki/File:" + dataImageName;
    }

    isImageWrapperElement(element) {
        return (element.tagName === "FIGURE") ||  super.isImageWrapperElement(element);
    }
}

//-----------------------------------------------------------------------------
// class SonakoParser
//-----------------------------------------------------------------------------

export class SonakoParser extends BakaTsukiParser {
    constructor() {
        super(new SonakoImageCollector());
    }

    extractTitleImpl(dom) {
        return dom.title;
    }

    extractLanguage(dom) {   // eslint-disable-line no-unused-vars
        // ToDo find language
        return "vi-VN";
    }

    extractSeriesInfo(dom, metaInfo) {   // eslint-disable-line no-unused-vars
        // This parser does not currently support this functionality
    }

    // find the node(s) holding the story content
    findContent(dom) {
        return dom.querySelector("div.mw-content-ltr");
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeElements(element.querySelectorAll("script, " +
            "noscript, " +

        // discard table of contents (will generate one from tags later)
            "div#toc-wrapper, " +
            "a.toc-link, " +

            "a.wikia-photogallery-add, " +
            "div.print-no"
        ));
        util.removeElements(util.getElements(element, "div", e => (e.id.startsWith("INCONTENT"))));

        util.removeComments(element);
        // hyperlinks that allow editing text
        util.removeElements(element.querySelectorAll("table, span.editsection"));

        // fix source for delay loaded image tags
        util.fixDelayLoadedImages(element, "data-src");
    }
}

