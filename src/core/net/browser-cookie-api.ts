/**
 * The adapter between the browser's `cookies` API and the cookie bridge.
 *
 * The bridge in `cookie-bridge.ts` is written against a small, explicit
 * interface so it can be tested without a browser. The browser's own API is
 * close but not identical:
 *
 *  - `cookies.getAll` requires a `url`, whereas the bridge asks by `domain`.
 *  - The browser reports `domain`, `path`, `secure` and `httpOnly` as
 *    optional; the bridge needs them.
 *  - The browser reports a partition key as an object, the bridge models it as
 *    a string.
 *
 * This module bridges the two. It is the only place that knows the browser's
 * cookie API's exact shape.
 *
 * See ADR-0004 and SECURITY.md §3.5.
 */
import type { CookieApi, CookieRecord } from "./cookie-bridge";

/**
 * The browser's cookie record, as the namespace reports it.
 */
interface BrowserCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
    partitionKey?: unknown;
}

/**
 * The browser's partition key, as the namespace reports it.
 */
interface BrowserPartitionKey {
    topLevelSite?: string;
    firstPartyDomain?: string;
}

/**
 * The cookie API the browser exposes, narrowed to what the bridge needs.
 */
export interface BrowserCookieApi {
    getAll(details: { url: string; name?: string }): Promise<BrowserCookie[]>;
    set(details: Record<string, unknown>): Promise<void>;
    remove(details: { url: string; name: string; partitionKey?: unknown }): Promise<void>;
}

/**
 * The browser's `cookies.getAll` needs a URL, but the bridge asks by domain.
 *
 * A URL is synthesised from the domain so the browser returns the cookies
 * that apply to it. A domain that is not a valid host — an IP address, or a
 * domain with a port — is handled by falling back to the host without the
 * port.
 *
 * @param domain The domain to look up.
 * @returns A URL for the domain, or `null` when there is not one.
 */
function urlForDomain(domain: string): string | null {
    const host = domain.replace(/^\./, "").split(":")[0] ?? "";
    if (!host) return null;
    // The path and the scheme do not matter to the browser: it matches
    // cookies by host, not by path.
    return `https://${host}/`;
}

/**
 * Build a cookie API for the bridge, if the browser has one.
 *
 * The browser's `cookies` API is always reachable in the extension's
 * background worker, but it can be missing in a test environment or in a
 * browser that has not granted the permission. In that case the caller gets
 * `undefined` and the extension carries on without partitioned-cookie
 * support.
 *
 * @param api The browser's cookie API, if there is one.
 * @returns A cookie API the bridge can use.
 */
export function createCookieApi(api: BrowserCookieApi | undefined): CookieApi | undefined {
    if (!api) return undefined;

    return {
        async getAll(details: { domain?: string; url?: string }): Promise<CookieRecord[]> {
            const url = details.url ?? (details.domain ? urlForDomain(details.domain) : null);
            if (!url) return [];

            const cookies = await api.getAll({ url });

            return cookies.map((cookie) => {
                const partitionKey = partitionKeyOf(cookie.partitionKey);
                return {
                    name: cookie.name,
                    value: cookie.value,
                    // The browser omits the domain when the cookie was set for
                    // the exact host, so the requested host is the best
                    // available answer.
                    domain: cookie.domain ?? hostOf(url),
                    path: cookie.path ?? "/",
                    secure: cookie.secure ?? false,
                    httpOnly: cookie.httpOnly ?? false,
                    sameSite: cookie.sameSite,
                    partitionKey,
                };
            });
        },

        async set(details): Promise<void> {
            const target: Record<string, unknown> = {
                url: details.url,
                name: details.name,
                value: details.value,
                path: details.path ?? "/",
                secure: details.secure ?? false,
                httpOnly: details.httpOnly ?? false,
            };
            if (details.sameSite) target["sameSite"] = details.sameSite;
            if (details.expirationDate !== undefined) {
                target["expirationDate"] = details.expirationDate;
            }
            // A `null` partition key is what creates the unpartitioned
            // counterpart of a partitioned cookie, so it is passed through
            // even though it is falsy.
            if ("partitionKey" in details) {
                target["partitionKey"] = details.partitionKey;
            }
            await api.set(target);
        },

        async remove(details): Promise<void> {
            const target: {
                url: string;
                name: string;
                partitionKey?: unknown;
                path?: string;
            } = {
                url: details.url,
                name: details.name,
            };
            // The browser identifies a cookie by its domain, its path and its
            // name. A removal that names a different path does not match the
            // cookie, and the copy stays in the jar.
            if (details.path) target.path = details.path;
            if ("partitionKey" in details) target.partitionKey = details.partitionKey;
            await api.remove(target);
        },
    };
}

/**
 * The host part of a URL.
 */
function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return "";
    }
}

/**
 * The partition key of a cookie, as the bridge models it.
 *
 * The browser reports a partition key as an object. The bridge only needs to
 * know *that* a cookie is partitioned, and to keep the key it belongs to, so
 * the top-level site is used when the browser reports one.
 */
function partitionKeyOf(value: unknown): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    const key = value as BrowserPartitionKey;
    return key.topLevelSite ?? key.firstPartyDomain ?? "partitioned";
}
