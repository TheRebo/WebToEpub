/**
 * The characters XML does not allow in a document.
 *
 * XML 1.0 permits the tab, the line feed and the carriage return, and every
 * character from U+0020 upwards. Everything else below U+0020 is forbidden —
 * not merely discouraged — and cannot appear in a document at all, not even
 * as a character reference. The surrogate range and U+FFFE and U+FFFF are
 * forbidden too.
 *
 * A chapter is written into a book as XHTML, which is XML. A document carrying
 * one of these characters is not well-formed, and a reader that checks refuses
 * the whole book rather than the one chapter. A site can put one of them into
 * its own markup, so the extension cannot assume they are not there.
 *
 * See ADR-0038.
 */

/**
 * The characters XML forbids, as a pattern.
 *
 * The rule flags a control character in a regular expression, and here the
 * control characters are the point: the pattern has to name them to remove
 * them.
 */
// eslint-disable-next-line no-control-regex -- the control characters are what is being removed
const ILLEGAL_CHARACTERS = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g;

/**
 * Remove the characters XML does not allow.
 *
 * The characters are removed rather than escaped: XML has no way to write
 * them, not even as a numeric character reference, so there is nothing to
 * escape them to.
 *
 * @param text The text.
 * @returns The text, without the characters XML forbids.
 */
export function stripIllegalXmlCharacters(text: string): string {
    return text.replace(ILLEGAL_CHARACTERS, "");
}
