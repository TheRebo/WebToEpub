import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";

/**
 * ESLint flat configuration for Kintsugi.
 *
 * Two rules here are specific to this project and are the reason the design
 * system stays intact:
 *
 *  - `no-raw-colors-in-components` — a raw hex/rgb value in a component's
 *    CSS is a build failure. Components may only reference semantic tokens.
 *  - `no-restricted-globals` — the baseline's ambient globals (`alert`,
 *    `confirm`, `prompt`) are banned, so every dialog is a real component.
 */
export default defineConfig([
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "coverage/**",
            "test-results/**",
            "playwright-report/**",
            "src/core/parsers/legacy/**",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: { ...globals.browser, ...globals.webextensions },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
            "@typescript-eslint/no-explicit-any": "warn",
            "no-console": ["warn", { allow: ["warn", "error"] }],
            eqeqeq: ["error", "always", { null: "ignore" }],
            "prefer-const": "error",
            "no-var": "error",
        },
    },
    {
        files: ["tools/**/*.mjs", "*.config.mjs", "eslint.config.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: { ...globals.node },
        },
        rules: {
            "no-console": "off",
        },
    },
    {
        files: ["tests/**/*.ts"],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            "no-console": "off",
        },
    },
    {
        // Component CSS may only reference semantic tokens.
        //
        // The component stylesheets are inline template strings inside the
        // component's TypeScript file, not standalone `.css` files, so the
        // rule has to match the string literals in those files.
        files: ["src/ui/components/**/*.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "TemplateElement[value.raw=/(^|[^-\\w])(#[0-9a-fA-F]{3,8})\\b/]:not([value.raw=/var\\(--/])",
                    message:
                        "Raw colours are not allowed in component CSS. Use a Layer 2 semantic token (e.g. var(--accent)) from src/ui/styles/tokens.css.",
                },
            ],
        },
    },
    {
        files: ["src/**/*.ts"],
        rules: {
            "no-restricted-globals": [
                "error",
                { name: "alert", message: "Use <k-dialog> instead of alert()." },
                { name: "confirm", message: "Use <k-dialog> instead of confirm()." },
                { name: "prompt", message: "Use <k-dialog> instead of prompt()." },
            ],
            "no-restricted-properties": [
                "error",
                {
                    object: "window",
                    property: "innerHTML",
                    message: "Untrusted content must not be inserted as HTML. Use textContent or DOMPurify.sanitize().",
                },
            ],
        },
    },
    prettier,
]);
