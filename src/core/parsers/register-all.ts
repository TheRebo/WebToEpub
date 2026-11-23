/**
 * The parser registration.
 *
 * Every site parser is registered here. The registration is **generated** by
 * `tools/migrate-parsers.mjs` from the baseline's `plugin/js/parsers/`
 * directory, so the list cannot drift from the files that exist.
 *
 * The registry is the one module that knows about all the parsers, which is
 * what keeps the popup small — it ships no parser code at all, it just asks
 * the background worker.
 *
 * See ADR-0002.
 */
import type { ParserRegistry } from "./registry";

/** A generated registration. */
interface Registration {
    /** The host name. */
    host: string;
    /** The module path of the parser. */
    module: string;
}

/**
 * The generated registrations.
 *
 * Populated by `tools/migrate-parsers.mjs`. Until the migration lands, the
 * registry falls back to the default parser for every site.
 */
const REGISTRATIONS: Registration[] = [];

/**
 * Register every parser with the registry.
 *
 * The imports are dynamic so that a parser module is only evaluated when it
 * is actually needed — 437 modules evaluated eagerly would cost more than
 * the whole extension.
 */
export async function registerAllParsers(registry: ParserRegistry): Promise<void> {
    for (const registration of REGISTRATIONS) {
        try {
            const module = await import(registration.module);
            const constructor = module.default ?? module[Object.keys(module)[0] ?? ""];
            if (typeof constructor === "function") {
                registry.register(registration.host, constructor as never);
            }
        } catch (error) {
            // A parser that fails to load must not take the whole registry
            // down. The site simply falls back to the default parser.
            console.warn(
                `[kintsugi] Could not load the parser for ${registration.host}:`,
                error instanceof Error ? error.message : error,
            );
        }
    }
}

/** The number of registered parsers. */
export function registrationCount(): number {
    return REGISTRATIONS.length;
}
