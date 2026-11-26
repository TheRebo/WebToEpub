/**
 * The i18n layer.
 *
 * The interesting part is the counted messages.
 *
 * Firefox's `browser.i18n` does **not** choose a plural form by itself. The
 * `_one` and `_other` message variants that Chrome understands are ignored
 * there: the base message comes back whatever the count is. That was measured,
 * not assumed — a throwaway extension was installed in a real Firefox and
 * asked, and `getMessage("probe", ["1"])` returned the plural text.
 *
 * So a counted message comes in two: the base name for the plural, and the
 * base name with `One` for the singular. `tCount` picks between them, and
 * these tests hold it to that.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { COUNTED, MESSAGES, setI18nApi, tCount } from "../../../src/ui/i18n";
import en from "../../../src/_locales/en/messages.json";

/** A locale entry, as the catalogue stores it. */
interface LocaleEntry {
    message: string;
    placeholders?: Record<string, { content: string }>;
}

/**
 * A stand-in for `browser.i18n`.
 *
 * It reads the real English catalogue and interpolates the placeholders the
 * way the browser's API does, so the tests prove that the message really does
 * reach the user with the count in it.
 */
function stubI18n(): void {
    setI18nApi({
        getMessage(key, substitutions) {
            const entry = (en as Record<string, LocaleEntry | undefined>)[key];
            if (!entry) return "";
            const values = substitutions === undefined ? [] : [substitutions].flat().map(String);
            let text = entry.message;
            for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
                const index = Number(placeholder.content.replace("$", "")) - 1;
                const value = values[index];
                if (value !== undefined) {
                    text = text.replaceAll(`$${name.toUpperCase()}$`, value);
                }
            }
            return text;
        },
    });
}

describe("a counted message", () => {
    beforeEach(() => {
        stubI18n();
    });

    it("uses the plural for more than one", () => {
        expect(tCount("popupChapterCount", 12)).toBe("12 chapters");
    });

    it("uses the singular for exactly one", () => {
        expect(tCount("popupChapterCount", 1)).toBe("1 chapter");
    });

    it("does not use the singular for zero", () => {
        // Zero is not one. A book with no chapters is not "0 chapter".
        expect(tCount("popupChapterCount", 0)).toBe("0 chapters");
    });

    it("puts the count first, and the other substitutions after it", () => {
        // The library's metadata line counts chapters and shows the size, and
        // the two placeholders are numbered by their position in the message.
        expect(tCount("optionsLibraryMeta", 1, ["2 MB"])).toBe("1 chapter · 2 MB");
        expect(tCount("optionsLibraryMeta", 3, ["2 MB"])).toBe("3 chapters · 2 MB");
    });

    it("gives every counted message a singular form in the catalogue", () => {
        for (const [base, singular] of Object.entries(COUNTED)) {
            expect(en, `${base} has no singular form`).toHaveProperty(singular);
            expect(en, `${base} has no plural form`).toHaveProperty(base);
        }
    });

    it("names every counted message in the catalogue the UI reads", () => {
        for (const key of Object.keys(COUNTED)) {
            expect(MESSAGES, `${key} is not a known message`).toHaveProperty(key);
        }
        for (const key of Object.values(COUNTED)) {
            expect(MESSAGES, `${key} is not a known message`).toHaveProperty(key);
        }
    });

    it("keeps the same placeholder in the singular form as in the plural", () => {
        // A singular form with a different placeholder would silently lose the
        // count.
        const catalogue = en as Record<string, LocaleEntry>;
        for (const [base, singular] of Object.entries(COUNTED)) {
            const tokens = (text: string) =>
                [...text.matchAll(/\$([A-Z_][A-Z0-9_]*)\$/g)].map((match) => match[1]);
            expect(tokens(catalogue[singular]?.message ?? "")).toEqual(
                tokens(catalogue[base]?.message ?? ""),
            );
        }
    });
});
