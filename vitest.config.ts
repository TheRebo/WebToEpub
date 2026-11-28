/**
 * The test configuration.
 *
 * The unit tests run against a DOM, because almost everything
 * interesting in this project is a DOM operation: a parser finds a content
 * element, the sanitiser strips a script tag, the packer builds an EPUB from
 * a chapter's markup.
 *
 * `happy-dom` is used rather than `jsdom` because it is faster and its
 * `DOMParser` and `XMLSerializer` behave like a browser's, which matters for
 * the XHTML conversion the packer does.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "happy-dom",
        include: ["tests/unit/**/*.test.ts"],
        // The migrated parsers are 434 modules; loading them all in one worker
        // is slow but correct. The contract test that needs them is isolated
        // to its own file (tests/unit/tooling) so the rest stays fast.
        testTimeout: 30_000,
        hookTimeout: 30_000,
        coverage: {
            provider: "v8",
            reportsDirectory: "coverage",
            include: ["src/core/**/*.ts", "src/ui/**/*.ts"],
            exclude: [
                "src/core/parsers/legacy/**",
                "src/core/parsers/legacy-parsers.ts",
                "src/types/**",
            ],
        },
    },
});
