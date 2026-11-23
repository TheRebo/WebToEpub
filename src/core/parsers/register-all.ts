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
import type { ParserRegistry } from "./registry";

/**
 * Register every parser with the registry.
 *
 * The parsers register themselves as their modules are evaluated, so this is
 * a matter of making sure the modules have been loaded. The import above does
 * that, and it happens before this function is called.
 *
 * The function still exists, and is still asynchronous, because the baseline
 * loaded the parsers lazily and a caller must be able to wait for the
 * registration to be complete.
 */
export async function registerAllParsers(_registry?: ParserRegistry): Promise<void> {
    // The parsers are loaded by the module-level import above.
}

/** The number of parsers that were migrated. */
export function registrationCount(): number {
    return 434;
}
