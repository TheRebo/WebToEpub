/**
 * The lazy `zip.js` facade.
 *
 * One migrated parser — `DarkNovelsParser` — reads a ZIP archive that the
 * site's API returns. It used the baseline's global `zip` namespace, which
 * came from a `<script>` tag in the baseline's popup page.
 *
 * The rewrite has no globals, and it has no reason to load a 155 KB ZIP
 * library for the sake of one parser whose site the baseline's own author
 * described as "server is down so i am unable to test the code". So the
 * library is loaded on demand instead: this module exposes a `zip` object
 * whose members are *proxies* that resolve to the real thing the first time
 * they are used.
 *
 * The proxy is thenable, so the baseline's `await new zip.Uint8ArrayReader(…)`
 * resolves to the real reader, and the baseline's
 * `new zip.ZipReader(reader, …)` — which is **not** awaited — still works,
 * because its methods are resolved lazily and its arguments are unwrapped
 * first.
 *
 * See ADR-0012.
 */

"use strict";

import type * as ZipJs from "@zip.js/zip.js";

/** The `zip.js` module. */
type ZipModule = typeof ZipJs;

/** The module, once it has been loaded. */
let loaded: ZipModule | undefined;

/** The load, while it is in flight. */
let pending: Promise<ZipModule> | undefined;

/**
 * Load `zip.js`, once.
 *
 * The module is loaded on the first call and kept for the life of the worker.
 */
export function loadZip(): Promise<ZipModule> {
    if (loaded) return Promise.resolve(loaded);
    pending ??= import("@zip.js/zip.js").then((module) => {
        loaded = module as ZipModule;
        return loaded;
    });
    return pending;
}

/** The marker that identifies a lazy instance. */
const LAZY_MARKER = Symbol.for("kintsugi.lazyZipInstance");

/**
 * Build a lazy instance of one of `zip.js`'s classes.
 *
 * The instance is created as soon as the module has loaded, and every method
 * call waits for that. Awaiting the proxy yields the real instance, so the
 * baseline's `await new zip.Uint8ArrayReader(bytes)` works unchanged.
 */
function lazyInstance(name: string, args: unknown[]): object {
    const instance = loadZip().then(async (module) => {
        // The arguments may themselves be lazy instances — `ZipReader` takes a
        // reader — so they are unwrapped before the real constructor sees them.
        const resolved = await Promise.all(args);
        const constructor = (
            module as unknown as Record<string, new (...values: unknown[]) => object>
        )[name];
        if (typeof constructor !== "function") {
            throw new Error(`zip.js does not export ${name}.`);
        }
        return new constructor(...resolved);
    });

    return new Proxy(
        {},
        {
            get(_target, property) {
                if (property === LAZY_MARKER) return true;
                if (property === "then") {
                    return (
                        onFulfilled?: (value: unknown) => unknown,
                        onRejected?: (reason: unknown) => unknown,
                    ): Promise<unknown> => instance.then(onFulfilled, onRejected);
                }
                return (...callArgs: unknown[]): Promise<unknown> =>
                    instance.then((resolved) => {
                        const value = (resolved as Record<string | symbol, unknown>)[property];
                        if (typeof value === "function") {
                            return (value as (...values: unknown[]) => unknown).apply(
                                resolved,
                                callArgs,
                            );
                        }
                        return value;
                    });
            },
        },
    );
}

/**
 * The `zip` namespace.
 *
 * Every member behaves like the `zip.js` class of the same name, but the
 * class is only fetched when it is first used.
 */
export const zip = new Proxy(
    {},
    {
        get(_target, property) {
            if (typeof property !== "string") return undefined;
            if (property === "then") return undefined;
            return function (...args: unknown[]): object {
                return lazyInstance(property, args);
            };
        },
    },
) as unknown as Record<string, new (...args: unknown[]) => object>;
