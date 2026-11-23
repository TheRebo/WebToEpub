/**
 * The active parser services.
 *
 * A parser needs three things: a way to fetch, a set of utilities, and an
 * image collector. The rewrite passes them in through the constructor, which
 * is the right shape for new code.
 *
 * The legacy parsers were not written that way. Their constructors call
 * `super()` with no arguments, because in the baseline the services were
 * globals. Rather than rewrite 437 constructors, the compat base class
 * resolves its services from this module when the constructor was given
 * none.
 *
 * The indirection exists only for the legacy path. The background worker
 * calls `setParserServices` once, at startup, before any parser is built.
 *
 * See ADR-0002.
 */

import type { ParserServices } from "./parser";

let services: ParserServices | undefined;

/**
 * Set the services the registry injects into a parser.
 *
 * Calling this twice replaces the previous services, which is what a test
 * needs.
 */
export function setParserServices(next: ParserServices): void {
    services = next;
}

/**
 * The services the registry injects.
 *
 * @throws When the services have not been set yet.
 */
export function getParserServices(): ParserServices {
    if (services === undefined) {
        throw new Error(
            "Parser services have not been set. Call setParserServices() before building a parser.",
        );
    }
    return services;
}

/**
 * The services, if they have been set.
 *
 * Used by the legacy base class, which must not throw when a parser is
 * constructed outside the worker — a test, or a tool that only wants the
 * class's metadata.
 */
export function peekParserServices(): ParserServices | undefined {
    return services;
}
