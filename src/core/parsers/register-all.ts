/**
 * The parser registration.
 *
 * Every site parser registers itself when its module is evaluated. This
 * module loads them, in the baseline's order, so that the registry knows
 * every site the extension supports.
 *
 * The registry is the one module that knows about all the parsers, which is
 * what keeps the popup small — it ships no parser code at all, it just asks
 * the background worker.
 *
 * See ADR-0002.
 */
import "./legacy-parsers.js";
// Loaded after the migrated parsers, so a new parser for a host they cover
// fails loudly as a duplicate rather than silently taking it over.
import "./site-parsers";
import type { ParserRegistry } from "./registry";
import { legacyRegistry } from "./compat/legacy-factory";

/**
 * Make sure every parser has registered itself.
 *
 * The parsers register with the legacy factory's registry as their modules
 * are evaluated, which the import above does. The function stays
 * asynchronous so a caller can wait for registration the same way whether
 * the parsers are bundled or, one day, loaded lazily.
 *
 * @returns The registry the parsers registered with.
 */
export async function registerAllParsers(): Promise<ParserRegistry> {
    return legacyRegistry;
}
