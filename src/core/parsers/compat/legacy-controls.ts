/**
 * The original popup's form controls, for the parsers that still read them.
 *
 * A handful of migrated parsers read `document.getElementById("…").checked`
 * or set a row's `hidden` while they list chapters. They now run in the
 * background page, which has none of those elements, so the read threw and
 * the site failed outright. This module puts inert stand-ins into the
 * background document, holding the values the user's settings imply.
 */

/** The checkboxes parsers read, with the original popup's defaults. */
const CHECKBOXES: Record<string, boolean> = {
    removeChapterNumberCheckbox: false,
    selectRetryLongerCheckbox: false,
    lesstagsCheckbox: true,
    coverFromUrlCheckboxInput: false,
};

/** The text inputs parsers read. */
const INPUTS = ["startingUrlInput", "passwordInput"];

/** The rows and sections parsers show or hide. */
const SECTIONS = [
    "removeAuthorNotesRow",
    "removeChapterNumberRow",
    "removeOriginalRow",
    "removeTranslatedRow",
    "highestResolutionImagesRow",
    "unSuperScriptAlternateTranslations",
    "translatorRow",
    "fileAuthorAsRow",
    "selectRetryLongerRow",
    "selectTranslationAiRow",
    "passwordRow",
    "outputSection",
    "imageSection",
];

/** The id of the hidden container the stand-ins live in. */
const CONTAINER_ID = "kintsugi-legacy-controls";

/** The values the stand-ins should hold. */
export interface LegacyControlValues {
    /** The story the user is looking at. */
    storyUrl?: string;
    /** Whether the user asked for chapter numbers to be removed. */
    removeChapterNumbers?: boolean;
}

/**
 * Put the stand-ins into a document, once, and set their values.
 *
 * @param doc The background page's document.
 * @param values The values to hold.
 */
export function syncLegacyControls(doc: Document | undefined, values: LegacyControlValues): void {
    if (!doc?.body) return;
    let container = doc.getElementById(CONTAINER_ID);
    if (!container) {
        container = doc.createElement("div");
        container.id = CONTAINER_ID;
        container.hidden = true;
        for (const [id, checked] of Object.entries(CHECKBOXES)) {
            const input = doc.createElement("input");
            input.type = "checkbox";
            input.id = id;
            input.checked = checked;
            container.append(input);
        }
        for (const id of INPUTS) {
            const input = doc.createElement("input");
            input.id = id;
            container.append(input);
        }
        for (const id of SECTIONS) {
            const section = doc.createElement("div");
            section.id = id;
            container.append(section);
        }
        doc.body.append(container);
    }

    if (values.removeChapterNumbers !== undefined) {
        const checkbox = doc.getElementById(
            "removeChapterNumberCheckbox",
        ) as HTMLInputElement | null;
        if (checkbox) checkbox.checked = values.removeChapterNumbers;
    }
    if (values.storyUrl !== undefined) {
        const input = doc.getElementById("startingUrlInput") as HTMLInputElement | null;
        if (input) input.value = values.storyUrl;
    }
}
