/**
 * The parser utilities.
 *
 * The baseline exposed `util` as a global object with 60-odd functions, most
 * of them untyped and several of them buggy. The rewrite keeps only the
 * functions the parsers actually call, and hands them to the parsers as an
 * explicit dependency.
 *
 * This module is the adapter between the plain functions in `util/dom.ts` and
 * the `ParserUtilities` interface the parser contract declares.
 */
import type { ParserUtilities } from "../parsers/parser";
import {
    convertPreTagToPTags,
    getFirstImgSrc,
    hyperLinkToChapter,
    hyperlinksToChapterList,
    moveChildElements,
    removeChildElementsMatchingSelector,
    removeComments,
    removeEmptyDivElements,
    removeElements,
    removeLeadingWhiteSpace,
    removeShareLinkElements,
    removeTrailingWhiteSpace,
    removeUnwantedWordpressElements,
} from "./dom";
import { normalizeUrlForCompare, safeForFileName } from "./primitives";

/**
 * Build the utilities a parser receives.
 *
 * The functions are bound here rather than exported as a mutable object, so a
 * parser cannot accidentally replace them for every other parser.
 */
export function buildParserUtilities(): ParserUtilities {
    return {
        hyperlinksToChapterList,
        hyperLinkToChapter,
        removeChildElementsMatchingSelector,
        removeElements,
        removeComments,
        removeUnwantedWordpressElements,
        removeShareLinkElements,
        removeEmptyDivElements,
        removeLeadingWhiteSpace,
        removeTrailingWhiteSpace,
        moveChildElements,
        getFirstImgSrc,
        convertPreTagToPTags,
        normalizeUrlForCompare,
        safeForFileName,
        isNullOrEmpty,
    };
}

/** Whether a value is null, undefined, or empty. */
export function isNullOrEmpty(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.length === 0;
}
