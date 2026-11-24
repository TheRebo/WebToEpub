/**
 * The message catalogue.
 *
 * ADR-0010 promises two things about localisation that are easy to break
 * silently and impossible to notice in the running extension:
 *
 *  1. `en` is complete, and every other locale is a **subset** of it. A key
 *     that exists in a translation but not in the source is dead weight; a key
 *     that exists in the source but not in a translation falls back to English,
 *     which is a visible quality gap.
 *  2. Every `$TOKEN$` in a message has a matching `placeholders` declaration.
 *     Firefox refuses to load a locale whose placeholder is undeclared, so an
 *     undeclared token is a broken extension, not a cosmetic issue.
 *
 * These tests read the *generated* `messages.json` files under
 * `src/_locales`, because that is what Firefox actually loads.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "../../src/ui/i18n";

const LOCALES_DIR = join(process.cwd(), "src", "_locales");

/** A message as Firefox reads it from `messages.json`. */
interface Message {
    message: string;
    description?: string;
    placeholders?: Record<string, { content: string; example: string }>;
}

/** A whole catalogue. */
type Catalogue = Record<string, Message>;

/** Read one locale's catalogue. */
function readCatalogue(locale: string): Catalogue {
    const path = join(LOCALES_DIR, locale, "messages.json");
    return JSON.parse(readFileSync(path, "utf8")) as Catalogue;
}

/** The locales that ship, excluding the source locale. */
const LOCALES = readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** The tokens a message uses. */
function tokensIn(message: string): string[] {
    return [...message.matchAll(/\$([A-Z_][A-Z0-9_]*)\$/g)]
        .map((match) => match[1])
        .filter((token): token is string => token !== undefined);
}

/**
 * Read a locale's *source* translations, from `tools/locales`.
 *
 * These are the hand-written files the generator reads. The generated
 * catalogues cannot answer "was this translated?", because the generator
 * fills the gaps with the English source.
 */
async function readLocaleSource(locale: string): Promise<Record<string, unknown>> {
    const module = (await import(`../../tools/locales/${locale}.mjs`)) as {
        default: Record<string, unknown>;
    };
    return module.default;
}

describe("the message catalogue", () => {
    const english = readCatalogue("en");

    it("ships more than one locale", () => {
        expect(LOCALES.length).toBeGreaterThan(1);
    });

    it("gives every locale a catalogue", () => {
        for (const locale of LOCALES) {
            expect(Object.keys(readCatalogue(locale)).length).toBeGreaterThan(0);
        }
    });

    it("covers every key the UI asks for", () => {
        for (const key of Object.keys(MESSAGES)) {
            expect(english, `the UI asks for "${key}"`).toHaveProperty(key);
        }
    });

    it("declares every placeholder a message uses", () => {
        for (const locale of LOCALES) {
            const catalogue = readCatalogue(locale);
            for (const [key, entry] of Object.entries(catalogue)) {
                const declared = Object.keys(entry.placeholders ?? {}).map((name) =>
                    name.toUpperCase(),
                );
                for (const token of tokensIn(entry.message)) {
                    expect(declared, `${locale}/${key} uses $${token}$`).toContain(token);
                }
            }
        }
    });

    it("numbers the placeholders by their position, so none overwrites another", () => {
        for (const locale of LOCALES) {
            const catalogue = readCatalogue(locale);
            for (const [key, entry] of Object.entries(catalogue)) {
                const placeholders = entry.placeholders;
                if (!placeholders) continue;

                const contents = Object.values(placeholders).map((p) => p.content);
                expect(new Set(contents).size, `${locale}/${key} reuses a substitution slot`).toBe(
                    contents.length,
                );

                // The token's own position in the message decides its slot, so
                // `$VISIBLE$ of $TOTAL$` and `$TOTAL$ of $VISIBLE$` both
                // substitute correctly.
                const expected = tokensIn(entry.message).map((token, index) => `$${index + 1}`);
                expect(Object.values(placeholders).map((p) => p.content)).toEqual(expected);
            }
        }
    });

    it("gives every locale exactly the keys the source has", () => {
        const sourceKeys = Object.keys(english).sort();
        for (const locale of LOCALES) {
            const keys = Object.keys(readCatalogue(locale)).sort();
            expect(keys, `${locale} does not match the source catalogue`).toEqual(sourceKeys);
        }
    });

    it("keeps the same placeholder tokens in every locale", () => {
        for (const locale of LOCALES) {
            const catalogue = readCatalogue(locale);
            for (const [key, entry] of Object.entries(english)) {
                const translation = catalogue[key];
                if (!translation) continue;
                expect(
                    tokensIn(translation.message).sort(),
                    `${locale}/${key} uses different placeholders`,
                ).toEqual(tokensIn(entry.message).sort());
            }
        }
    });

    it("gives every message a description, so a translator knows the intent", () => {
        for (const locale of LOCALES) {
            const catalogue = readCatalogue(locale);
            for (const [key, entry] of Object.entries(catalogue)) {
                expect(entry.description, `${locale}/${key} has no description`).toBeTruthy();
            }
        }
    });

    it("does not ship a message that is still an untranslated placeholder", async () => {
        // A translation is a *file*, not a diff against English: "Cover" is the
        // correct German word for "Cover", and a diff would flag it. What
        // matters is that every key was actually translated, so the check is
        // against the locale's source file, not against the English text.
        //
        // `en` is exempt: English is the source, so `tools/locales/en.mjs` is
        // deliberately empty.
        for (const locale of LOCALES) {
            if (locale === "en") continue;
            const translations = await readLocaleSource(locale);
            const missing = Object.keys(english).filter((key) => !(key in translations));
            expect(missing, `${locale} is missing ${missing.length} translations`).toEqual([]);
        }
    });
});
