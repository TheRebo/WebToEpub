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
 * The pattern carries no port. A browser's host permission is written as a
 * scheme, a host and a path, and a port is not part of it: `http://localhost`
 * and `http://localhost:8080` are the same host as far as a permission is
 * concerned, and a pattern that named a port would never match anything. The
 * grant therefore covers every port on the host, which is the browser's model
 * and not a choice this extension makes.
 *
 * @param origin The origin, such as `https://example.com`.
 * @returns The pattern, or `undefined` when the origin cannot be used.
 */
export function hostPattern(origin: string): string | undefined {
    const validated = validateOrigin(origin);
    if (!validated) return undefined;
    try {
        const parsed = new URL(validated);
        return `${parsed.protocol}//${parsed.hostname}/*`;
    } catch {
        return undefined;
    }
}

/**
 * The name to show for an origin.
 *
 * The port is kept: a site on `example.com:8080` is not the site on
 * `example.com`, and a user who allowed one of them should be able to tell
 * which.
 *
 * @param origin The origin.
 * @returns The host name, or the origin itself when it has none.
 */
export function displayOrigin(origin: string): string {
    try {
        return new URL(origin).host.replace(/^www\./, "");
    } catch {
        return origin;
    }
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
 * Whether the extension has been given access to an origin.
 *
 * This asks the browser, and the browser's answer is about the *whole* set of
 * grants — including the extension's own optional permission, which covers
 * every `http` and `https` host. Use this to decide whether the extension may
 * read a page; use {@link hasSpecificHostAccess} to decide whether the user
 * has allowed a host *in particular*.
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
 * Whether the user has allowed this host in particular.
 *
 * The extension's own optional permission — every `http` and `https` host on
 * the web — is not a grant to a site, and it is not a grant to the user's own
 * network either. A private host may only be reached when the user allowed
 * *that* host, so the check looks for a granted pattern that names the host
 * rather than asking whether the browser has any grant that would cover it.
 *
 * The browser's own answer cannot be used for this: `permissions.contains()`
 * says yes for a wildcard grant, and "the extension may read every site" is
 * not the same thing as "the user allowed this machine on the local network".
 *
 * @param origin The origin.
 * @returns Whether the host was granted on its own.
 */
export async function hasSpecificHostAccess(origin: string): Promise<boolean> {
    const pattern = hostPattern(origin);
    if (!pattern) return false;
    const api = getNamespace();
    if (!api) return false;
    let granted: string[] = [];
    try {
        const all = await api.permissions.getAll();
        granted = all.origins ?? [];
    } catch {
        return false;
    }
    return granted.some((origin_) => isHostPattern(origin_) && origin_ === pattern);
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
 * `example.com`. A granted pattern never carries a port — a browser's host
 * permission has no port in it — so the name never has one either.
 *
 * @param pattern The granted pattern.
 * @returns The host name, or the pattern itself when it has none.
 */
export function displayHost(pattern: string): string {
    const trimmed = pattern.replace(/\/\*$/, "");
    try {
        return new URL(trimmed).hostname.replace(/^www\./, "");
    } catch {
        return trimmed;
    }
}
