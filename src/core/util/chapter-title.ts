/**
 * Chapter titles.
 *
 * Sites write a chapter's number into its title — "Chapter 12: The Quiet Sea",
 * "12. The Quiet Sea", "#12 The Quiet Sea" — and readers who like the number
 * in the book's table of contents do not want it stripped out from under them.
 * That is why this is a setting and not a rule.
 *
 * The stripping is deliberately timid: it only removes a number that is
 * unmistakably a chapter number, and it never removes so much that the title
 * is left empty.
 */

/**
 * The words a site uses for a chapter, before its number.
 *
 * The list covers the languages the extension is translated into, plus the
 * ones the sites it is most used on are written in.
 */
const CHAPTER_WORDS = [
    "chapter",
    "chapitre",
    "kapitel",
    "capitolo",
    "capítulo",
    "capitulo",
    "chap",
    "ch",
    "episode",
    "ep",
    "part",
    "prologue",
    "epilogue",
].join("|");

/**
 * The patterns a chapter number is written in, in the order they are tried.
 *
 * Each pattern matches the number *and* whatever separates it from the rest
 * of the title, so that the title is left tidy.
 */
const PATTERNS: RegExp[] = [
    // "Chapter 12: The Quiet Sea", "Chapter 12 - The Quiet Sea".
    new RegExp(`^\\s*(?:${CHAPTER_WORDS})\\s*\\.?\\s*\\d+\\s*(?:[-–—:：.、)\\]|])\\s*`, "i"),
    // "#12 The Quiet Sea", "# 12: The Quiet Sea".
    /^#\s*\d+\s*(?:[-–—:：.、)\]|])?\s*/,
    // "12. The Quiet Sea", "12) The Quiet Sea", "12 - The Quiet Sea".
    /^\s*\d+\s*(?:[-–—:：.、)\]|])\s+/,
    // "Chapter 12 The Quiet Sea", where the author left out the separator.
    new RegExp(`^\\s*(?:${CHAPTER_WORDS})\\s*\\.?\\s*\\d+\\s+`, "i"),
    // "第12話" — the number follows the word in Japanese and Chinese.
    /^\s*第\s*\d+\s*(?:[話話章回卷])?\s*[:：.、-]?\s*/,
];

/**
 * Remove the chapter number from a title.
 *
 * The title is returned unchanged when no number is found, and also when
 * removing the number would leave nothing behind: a chapter with no title at
 * all is worse than a chapter whose title says "Chapter 12".
 *
 * @param title The title to clean.
 * @returns The title without its chapter number.
 */
export function removeChapterNumber(title: string): string {
    const trimmed = title.trim();
    if (trimmed === "") return title;

    for (const pattern of PATTERNS) {
        const replaced = trimmed.replace(pattern, "");
        // A pattern that did not match leaves the title alone; the next one
        // may still be the right one.
        if (replaced === trimmed) continue;

        const withoutNumber = replaced.trim();
        // A title that is nothing but a number is a title in its own right.
        if (withoutNumber === "") continue;
        // A title that is still only a number was never a title and a number.
        if (/^\d+$/.test(withoutNumber)) continue;
        return withoutNumber;
    }

    return title;
}
