/**
 * The site parsers written after the migration.
 *
 * `legacy-parsers.ts` and `legacy/sites/` are generated from the original
 * extension by `tools/migrate-parsers.mjs`, which deletes and rewrites them,
 * so a new parser never goes there. It goes in `sites/`, and its module is
 * imported here, in alphabetical order. Each parser registers itself with
 * `parserFactory` when its module is evaluated. See AGENTS.md.
 *
 * Example:
 *   import "./sites/ExampleParser.js";
 */
export {};
