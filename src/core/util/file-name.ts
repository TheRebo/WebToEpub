/**
 * Naming the file a book is saved as.
 *
 * The name comes from one of two places: the template the user set in the
 * options page, or a name the user typed into the workbench. Either way it
 * has to be made safe before it reaches the file system — a name may not
 * contain a path separator, and the characters Windows refuses are replaced
 * rather than dropped, so the name still reads like the title.
 *
 * The template supports `{title}` and `{author}`, which is what the options
 * page promises. An unknown placeholder is left alone rather than replaced
 * with nothing, so a typo is visible instead of silently changing the name.
 */

/** The template used when the user has not set one. */
export const DEFAULT_FILENAME_TEMPLATE = "{title}";

/** The placeholders a template may use. */
const PLACEHOLDERS: Record<string, string> = {
    "{title}": "title",
    "{author}": "author",
};

/**
 * The words that join a title and an author.
 *
 * When a placeholder has nothing to put in it, the word that introduced it
 * would be left dangling — "A Story by". The word goes with the empty
 * placeholder.
 */
const JOINERS = "by|from|of";

/** The context a template is filled in from. */
export interface FileNameContext {
    /** The book's title. */
    title: string;
    /** The book's author. */
    author?: string;
}

/**
 * Fill a filename template in.
 *
 * @param template The template, e.g. `{title} by {author}`.
 * @param context The values for the placeholders.
 * @returns The filled-in name, before it is made safe.
 */
export function applyFilenameTemplate(template: string, context: FileNameContext): string {
    const trimmed = template.trim();
    if (trimmed === "") return context.title.trim();

    let filled = trimmed;
    for (const [placeholder, key] of Object.entries(PLACEHOLDERS)) {
        const value = key === "title" ? context.title : (context.author ?? "");
        filled = filled.split(placeholder).join(value.trim());
    }

    return tidy(filled);
}

/**
 * Tidy a filled-in template.
 *
 * A placeholder with nothing to put in it leaves a joiner or a separator
 * hanging off the end of the name, so those are taken away.
 *
 * @param text The filled-in template.
 * @returns The tidied name.
 */
function tidy(text: string): string {
    return (
        text
            .replace(new RegExp(`\\s+(?:${JOINERS})\\s*$`, "i"), "")
            .replace(new RegExp(`^\\s*(?:${JOINERS})\\s+`, "i"), "")
            // The braces are left alone: they are how an unknown placeholder stays
            // visible instead of being silently changed.
            .replace(/[\s\-–—_,.:;!?()[\]]+$/, "")
            .replace(/^[\s\-–—_,.:;!?()[\]]+/, "")
            .replace(/\s{2,}/g, " ")
            .trim()
    );
}

/**
 * Make a string safe to use as a file name.
 *
 * The characters that are illegal on Windows are replaced with a dash, the
 * control characters are dropped, and the name is trimmed of the dots and
 * spaces that Windows would refuse at the end.
 *
 * @param title The name to make safe.
 * @param maxLength The longest name to allow.
 * @returns The safe name.
 */
export function sanitizeFileName(title: string, maxLength = 120): string {
    let safe = title
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/^[\s.]+|[\s.]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    safe = [...safe]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code > 0x1f && !(code >= 0x7f && code <= 0x9f);
        })
        .join("");
    if (!safe) safe = "untitled";
    if (safe.length > maxLength) safe = safe.slice(0, maxLength).trim();
    return safe;
}

/**
 * Remove the `.epub` extension from a name, if it has one.
 *
 * The extension is added back when the file is saved, so a name that already
 * carries one must not end up with two.
 *
 * @param name The name.
 * @returns The name without its extension.
 */
export function stripEpubExtension(name: string): string {
    return name.replace(/\.epub$/i, "");
}

/**
 * Build the name a book is saved as.
 *
 * @param template The user's filename template.
 * @param context The values for the placeholders.
 * @param explicitName The name the user typed, if they typed one. It wins
 *   over the template.
 * @returns The file name, extension included.
 */
export function buildFileName(
    template: string,
    context: FileNameContext,
    explicitName?: string,
): string {
    const explicit = (explicitName ?? "").trim();
    const base = explicit ? stripEpubExtension(explicit) : applyFilenameTemplate(template, context);
    return `${sanitizeFileName(base)}.epub`;
}
