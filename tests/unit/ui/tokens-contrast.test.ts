/**
 * The design tokens' contrast.
 *
 * The accent is used as a button background with white text on it, as
 * accent-coloured text on the page background, and as the focus ring. Each of
 * those is a contrast requirement, and each of them fails in a different way.
 *
 * These tests read `src/ui/styles/tokens.css` from disk and resolve the token
 * graph for every accent family in both themes, so that a change to a ramp or
 * to a semantic token is caught here rather than by eye.
 *
 * The thresholds are WCAG 2.1:
 *  - 4.5:1 for text (1.4.3)
 *  - 3:1 for the focus ring, which is a UI component boundary (1.4.11)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TOKENS_PATH = join(process.cwd(), "src", "ui", "styles", "tokens.css");
const CSS = readFileSync(TOKENS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The accent families the product offers. */
const FAMILIES = ["gold", "ink", "verdigris", "plum"] as const;

/** An accent family. */
type Family = (typeof FAMILIES)[number];

/**
 * Extract a block's declarations.
 *
 * The braces are matched by counting, so a nested `@media` block is skipped
 * over correctly.
 *
 * @param selector The selector to find.
 * @returns The declarations, as a map of property name to value.
 */
function block(selector: string): Map<string, string> {
    const start = CSS.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`No block for ${selector}`);

    const open = CSS.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (let index = open; index < CSS.length; index += 1) {
        const character = CSS[index];
        if (character === "{") depth += 1;
        else if (character === "}") {
            depth -= 1;
            if (depth === 0) {
                end = index;
                break;
            }
        }
    }

    const declarations = new Map<string, string>();
    const body = CSS.slice(open + 1, end);
    for (const declaration of body.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator < 0) continue;
        const property = declaration.slice(0, separator).trim();
        const value = declaration.slice(separator + 1).trim();
        if (property.startsWith("--")) declarations.set(property, value);
    }
    return declarations;
}

/**
 * Resolve a token's value.
 *
 * @param variables The token map.
 * @param name The token name.
 * @returns The resolved value, which is a colour.
 */
function resolve(variables: Map<string, string>, name: string): string {
    const value = variables.get(name);
    if (value === undefined) throw new Error(`No token ${name}`);
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (!reference) return value;
    return resolve(variables, reference[1] as string);
}

/**
 * The tokens for a theme and an accent family.
 *
 * @param theme The theme.
 * @param family The accent family.
 * @returns The resolved token map.
 */
function tokens(theme: "light" | "dark", family: Family): Map<string, string> {
    const variables = new Map(block(":root"));
    if (theme === "dark") {
        for (const [property, value] of block('[data-theme="dark"]')) {
            variables.set(property, value);
        }
    }
    if (family !== "gold") {
        for (const [property, value] of block(`[data-accent="${family}"]`)) {
            variables.set(property, value);
        }
    }
    return variables;
}

/**
 * The relative luminance of a colour.
 *
 * @param colour The colour, as `#rrggbb`.
 * @returns The luminance, from 0 (black) to 1 (white).
 */
function luminance(colour: string): number {
    const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim());
    if (!hex) throw new Error(`Not a colour: ${colour}`);
    const value = parseInt(hex[1] as string, 16);
    const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
        const scaled = channel / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    });
    return (
        0.2126 * (channels[0] as number) +
        0.7152 * (channels[1] as number) +
        0.0722 * (channels[2] as number)
    );
}

/**
 * The contrast ratio between two colours.
 *
 * @param foreground The foreground colour.
 * @param background The background colour.
 * @returns The ratio, from 1 to 21.
 */
function contrast(foreground: string, background: string): number {
    const first = luminance(foreground);
    const second = luminance(background);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

describe("the design tokens", () => {
    describe("in the light theme", () => {
        for (const family of FAMILIES) {
            describe(`with the ${family} accent`, () => {
                const variables = tokens("light", family);

                it("has white text on the accent at 4.5:1 or better", () => {
                    const ratio = contrast(
                        resolve(variables, "--text-on-accent"),
                        resolve(variables, "--accent"),
                    );
                    expect(ratio).toBeGreaterThanOrEqual(4.5);
                });

                it("has accent-coloured text on the background at 4.5:1 or better", () => {
                    const ratio = contrast(
                        resolve(variables, "--accent-text"),
                        resolve(variables, "--bg"),
                    );
                    expect(ratio).toBeGreaterThanOrEqual(4.5);
                });

                it("has accent-coloured text on the subtle tint at 4.5:1 or better", () => {
                    const ratio = contrast(
                        resolve(variables, "--accent-text"),
                        resolve(variables, "--accent-subtle"),
                    );
                    expect(ratio).toBeGreaterThanOrEqual(4.5);
                });

                it("has a focus ring that is visible against the background and the surface", () => {
                    const ring = resolve(variables, "--focus-ring");
                    expect(contrast(ring, resolve(variables, "--bg"))).toBeGreaterThanOrEqual(3);
                    expect(contrast(ring, resolve(variables, "--surface"))).toBeGreaterThanOrEqual(
                        3,
                    );
                });
            });
        }
    });

    describe("in the dark theme", () => {
        for (const family of FAMILIES) {
            describe(`with the ${family} accent`, () => {
                const variables = tokens("dark", family);

                it("has dark text on the accent at 4.5:1 or better", () => {
                    const ratio = contrast(
                        resolve(variables, "--text-on-accent"),
                        resolve(variables, "--accent"),
                    );
                    expect(ratio).toBeGreaterThanOrEqual(4.5);
                });

                it("has accent-coloured text on the background at 4.5:1 or better", () => {
                    const ratio = contrast(
                        resolve(variables, "--accent-text"),
                        resolve(variables, "--bg"),
                    );
                    expect(ratio).toBeGreaterThanOrEqual(4.5);
                });

                it("has a focus ring that is visible against the background and the surface", () => {
                    const ring = resolve(variables, "--focus-ring");
                    expect(contrast(ring, resolve(variables, "--bg"))).toBeGreaterThanOrEqual(3);
                    expect(contrast(ring, resolve(variables, "--surface"))).toBeGreaterThanOrEqual(
                        3,
                    );
                });
            });
        }
    });
});

describe("every text and control pairing the pages use", () => {
    const SURFACES = [
        "--bg",
        "--bg-subtle",
        "--surface",
        "--surface-raised",
        "--surface-sunken",
        "--gray-100",
        "--accent-subtle",
    ];

    for (const theme of ["light", "dark"] as const) {
        for (const family of FAMILIES) {
            describe(`in the ${theme} theme with the ${family} accent`, () => {
                const variables = tokens(theme, family);

                for (const text of ["--text", "--text-secondary", "--text-muted"]) {
                    it(`has ${text} at 4.5:1 or better on every surface`, () => {
                        for (const surface of SURFACES) {
                            const ratio = contrast(
                                resolve(variables, text),
                                resolve(variables, surface),
                            );
                            expect(ratio, `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
                        }
                    });
                }

                it("draws a control's edge at 3:1 or better against the surfaces it sits on", () => {
                    for (const surface of ["--bg", "--surface", "--surface-raised"]) {
                        const ratio = contrast(
                            resolve(variables, "--border-strong"),
                            resolve(variables, surface),
                        );
                        expect(ratio, `--border-strong on ${surface}`).toBeGreaterThanOrEqual(3);
                    }
                });

                it("has the danger button's text at 4.5:1 or better", () => {
                    const ratio = contrast(
                        resolve(variables, "--text-on-danger"),
                        resolve(variables, "--danger"),
                    );
                    expect(ratio).toBeGreaterThanOrEqual(4.5);
                });

                for (const status of ["--success", "--warning", "--danger", "--info"]) {
                    it(`has ${status} text at 4.5:1 or better on its own tint and the page`, () => {
                        for (const surface of ["--bg", "--surface", `${status}-subtle`]) {
                            const ratio = contrast(
                                resolve(variables, status),
                                resolve(variables, surface),
                            );
                            expect(ratio, `${status} on ${surface}`).toBeGreaterThanOrEqual(4.5);
                        }
                    });
                }
            });
        }
    }
});
