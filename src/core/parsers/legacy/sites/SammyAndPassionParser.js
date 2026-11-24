// Ai generated + Claude Opus 4.6
// Migrated from `plugin/js/parsers/SammyAndPassionParser.js` on the `legacy` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";

import { LegacyParser as Parser } from "../../compat/legacy-parser.js";
import { util } from "../../compat/legacy-util.js";
import { parserFactory } from "../../compat/legacy-factory.js";

parserFactory.register("sammyandpassion.com", () => new SammyAndPassionParser());

export class SammyAndPassionParser extends Parser {
    constructor() {
        super();
        this.minimumThrottle = 500;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("h3.wp-block-heading");
    }

    extractAuthor(dom) {
        let authorParagraph = [...dom.querySelectorAll("p")]
            .find((p) => p.textContent.includes("Author:"));
        if (!authorParagraph) {
            return super.extractAuthor(dom);
        }
        let firstLine = authorParagraph.innerHTML.split(/<br\s*\/?>/i)[0];
        let text = firstLine.replace(/<[^>]+>/g, "");
        return text.replace(/.*Author:\s*/, "").trim();
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "figure.wp-block-image");
    }

    getChapterUrls(dom) {
        let excludedLabels = ["first chapter", "last chapter", "let's go", "lets go"];
        let linkSet = new Set();

        let links = dom.querySelectorAll(".wp-block-buttons a.wp-block-button__link, .wp-block-button a.wp-block-button__link");

        return [...links]
            .filter((link) => {
                if (!link.href.startsWith("https://sammyandpassion.com/")) {
                    return false;
                }
                let text = link.textContent.trim().toLowerCase();
                if (excludedLabels.includes(text)) {
                    return false;
                }
                let normalizedHref = util.normalizeUrlForCompare(link.href);
                if (linkSet.has(normalizedHref)) {
                    return false;
                }
                linkSet.add(normalizedHref);
                return true;
            })
            .map((link) => ({
                sourceUrl: link.href,
                title: link.textContent.trim()
            }));
    }

    findContent(dom) {
        return dom.querySelector("div.entry-content");
    }

    customRawDomToContentStep(chapter, content) {
        this.convertBackgroundImagesToImgTags(content);
    }

    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(element, ".wp-block-buttons");
        super.removeUnwantedElementsFromContentElement(element);
    }

    convertBackgroundImagesToImgTags(element) {
        let backgroundDivs = element.querySelectorAll(".wp-block-cover__image-background");
        backgroundDivs.forEach((div) => {
            let match = (div.getAttribute("style") || "").match(/background-image:\s*url\(([^)]+)\)/);
            if (match) {
                let img = div.ownerDocument.createElement("img");
                img.src = match[1].replace(/^["']|["']$/g, "");
                div.replaceWith(img);
            }
        });
    }
}
