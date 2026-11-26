/**
 * Host access.
 *
 * The extension can read the sites the user has allowed it to read, and no
 * others. The permission is *optional*: the extension ships with no host
 * permissions at all, and asks for one site at a time, at the moment the user
 * chooses that site.
 *
 * The request has to be made from an extension page, in the handler of a real
 * click. Firefox will not honour a request that comes from the background
 * worker, because there is no user gesture behind it — and a permission prompt
 * that appears without the user having asked for something is exactly the kind
 * of thing people are taught to dismiss. See ADR-0007.
 */
import { getNamespace } from "./browser-api";
import { validateOrigin } from "./util/sanitize";

/**
 * The permission pattern that covers an origin.
 *
 * The pattern is built from a validated origin, so it can only ever be a
 * scheme, a host and a path — never a wildcard of the extension's own.
 *
 * @param origin The origin, such as `https://example.com`.
 * @returns The pattern, or `undefined` when the origin cannot be used.
 */
export function hostPattern(origin: string): string | undefined {
    const validated = validateOrigin(origin);
    return validated ? `${validated}/*` : undefined;
}

/**
 * The origin of a URL, for a host permission.
 *
 * @param url The URL.
 * @returns The origin, or `undefined` when the URL is not a web address.
 */
export function originOf(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
        return parsed.origin;
    } catch {
        return undefined;
    }
}

/**
 * Whether the extension may read an origin.
 *
 * @param origin The origin.
 * @returns Whether access has been granted.
 */
export async function hasHostAccess(origin: string): Promise<boolean> {
    const pattern = hostPattern(origin);
    if (!pattern) return false;
    const api = getNamespace();
    if (!api) return false;
    try {
        return await api.permissions.contains({ origins: [pattern] });
    } catch {
        return false;
    }
}

/**
 * Ask the user for access to an origin.
 *
 * This must be called from the handler of a real click, in an extension page:
 * Firefox rejects the request otherwise.
 *
 * @param origin The origin.
 * @returns Whether the user granted access.
 */
export async function requestHostAccess(origin: string): Promise<boolean> {
    const pattern = hostPattern(origin);
    if (!pattern) return false;
    const api = getNamespace();
    if (!api) return false;
    try {
        return await api.permissions.request({ origins: [pattern] });
    } catch {
        return false;
    }
}

/**
 * The origins the extension has been given access to.
 *
 * The extension's own optional permission — every `http` and `https` host — is
 * not a grant to a site, and it is left out of the list: the list is what the
 * user has allowed, and the user has not allowed every site on the web.
 *
 * @returns The granted origins, as patterns.
 */
export async function listHostAccess(): Promise<string[]> {
    const api = getNamespace();
    if (!api) return [];
    try {
        const all = await api.permissions.getAll();
        return (all.origins ?? []).filter((origin) => isHostPattern(origin));
    } catch {
        return [];
    }
}

/**
 * Give up access to an origin.
 *
 * @param origin The origin.
 * @returns Whether access was taken away.
 */
export async function revokeHostAccess(origin: string): Promise<boolean> {
    const pattern = hostPattern(origin);
    if (!pattern) return false;
    return revokeHostPattern(pattern);
}

/**
 * Give up access to a granted pattern.
 *
 * The list of granted permissions holds *patterns* — `https://example.com/*` —
 * rather than origins, so this is what takes one of them back. The pattern is
 * checked before it is handed to the browser: an extension page must not be
 * able to talk the browser into removing a permission it was never given, and
 * a pattern that is not one of the extension's own would be exactly that.
 *
 * @param pattern The granted pattern.
 * @returns Whether access was taken away.
 */
export async function revokeHostPattern(pattern: string): Promise<boolean> {
    if (!isHostPattern(pattern)) return false;
    const api = getNamespace();
    if (!api) return false;
    try {
        return await api.permissions.remove({ origins: [pattern] });
    } catch {
        return false;
    }
}

/**
 * Whether a string is one of the extension's own host patterns.
 *
 * A pattern is a scheme, a host and `/*`. The host may not carry a wildcard:
 * the browser only grants the extension the patterns it asked for, and a
 * wildcard would be one it never asked for.
 *
 * @param pattern The pattern.
 * @returns Whether it is a host pattern.
 */
export function isHostPattern(pattern: string): boolean {
    return /^https?:\/\/[^/*?#]+\/\*$/.test(pattern);
}

/**
 * The name to show for a granted pattern.
 *
 * A pattern is `https://example.com/*`; what the user recognises is
 * `example.com`.
 *
 * @param pattern The granted pattern.
 * @returns The host name, or the pattern itself when it has none.
 */
export function displayHost(pattern: string): string {
    const trimmed = pattern.replace(/\/\*$/, "");
    try {
        // `host` rather than `hostname`: the port is part of the site, and a
        // site on `example.com:8080` is not the site on `example.com`.
        return new URL(trimmed).host.replace(/^www\./, "");
    } catch {
        return trimmed;
    }
}
