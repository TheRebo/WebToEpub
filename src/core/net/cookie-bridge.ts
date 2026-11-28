/**
 * The cookie bridge.
 *
 * Some protected sites authenticate the page with a **partitioned**
 * (CHIPS) cookie. A request made from the extension's own context does not
 * receive that partitioned cookie, so the site returns a login page instead
 * of the chapter.
 *
 * This module copies the site's cookies into unpartitioned cookies for the
 * duration of a request, then removes them. The removal is guaranteed: the
 * caller wraps the request in a `finally`, and this module additionally
 * cleans up any leftovers it can find.
 *
 * See ADR-0004 and SECURITY.md §3.5.
 */
import { registrableDomain } from "../util/sanitize";

/** A cookie as the browser API reports it. */
export interface CookieRecord {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite?: string;
    /** The partition key, for partitioned cookies. */
    partitionKey?: string;
}

/** The subset of the `cookies` API this module uses. */
export interface CookieApi {
    getAll(details: {
        domain?: string;
        url?: string;
        partitionKey?: { topLevelSite: string };
    }): Promise<CookieRecord[]>;
    set(details: {
        url: string;
        /** The cookie's domain, for a domain cookie. */
        domain?: string;
        name: string;
        value: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: string;
        expirationDate?: number;
        /** `null` removes a partitioned cookie. */
        partitionKey?: { topLevelSite: string } | null;
    }): Promise<void>;
    remove(details: { url: string; name: string; storeId?: string; path?: string }): Promise<void>;
}

/**
 * A cookie this bridge copied, and where it put it.
 *
 * The browser identifies a cookie by its domain, its path *and* its name, so
 * all three are remembered: a copy made at `/app` is not the same cookie as
 * one made at `/`, and a copy made for `.example.com` is not the same cookie
 * as one made for `www.example.com`. Removing a copy has to name the same
 * three things it was created with, or it removes nothing at all.
 */
export interface CopiedCookie {
    /** The cookie's name. */
    name: string;
    /** The path the copy was set at. */
    path: string;
    /** The host the copy was set at. */
    domain: string;
}

/**
 * The key a copy is remembered under.
 *
 * @param copy The copy.
 * @returns The key.
 */
function copyKey(copy: CopiedCookie): string {
    return `${copy.domain}\u0000${copy.path}\u0000${copy.name}`;
}

/** A copy, and how many requests are using it. */
interface CopyRecord {
    /** The copy itself. */
    copy: CopiedCookie;
    /** How many requests are holding it. */
    refs: number;
}

/** The bridge. */
export class CookieBridge {
    #api: CookieApi;
    /**
     * The cookies this bridge copied, and who is using them.
     *
     * The count matters: two requests to the same site can be in flight at
     * once, and the copy in the jar is one cookie however many requests want
     * it. Removing it when the first of them finishes would pull the cookie
     * out from under the second.
     */
    #copied = new Map<string, CopyRecord>();

    constructor(api: CookieApi) {
        this.#api = api;
    }

    /**
     * Copy the partitioned cookies for a domain into unpartitioned ones.
     *
     * The copy is set on the cookie's own host, not on the host that was
     * asked for: a cookie set on `.example.com` belongs to `example.com` and
     * to everything under it, and the browser will only send it to a request
     * for that host.
     *
     * @returns The cookies that were copied, each with the place it was put.
     */
    async copyForDomain(domain: string): Promise<CopiedCookie[]> {
        if (!this.#api) return [];

        let partitioned: CookieRecord[];
        try {
            partitioned = await this.#api.getAll({ domain });
        } catch {
            // A site with no cookies, or a domain the browser will not
            // disclose, is not an error.
            return [];
        }

        const copied: CopiedCookie[] = [];
        for (const cookie of partitioned) {
            // Only partitioned cookies need copying; an unpartitioned cookie
            // is already sent to the extension's context.
            if (!cookie.partitionKey) continue;
            if (!isCookieForDomain(cookie.domain, domain)) continue;

            const path = cookie.path || "/";
            const host = cookie.domain.replace(/^\./, "");
            // The user's own unpartitioned cookie of the same name is never
            // overwritten, or the clean-up afterwards would delete it.
            if (await this.#hasUnpartitioned(host, path, cookie.name)) continue;
            try {
                await this.#api.set({
                    url: `https://${host}${path}`,
                    ...(cookie.domain.startsWith(".") ? { domain: cookie.domain } : {}),
                    name: cookie.name,
                    value: cookie.value,
                    path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    sameSite: cookie.sameSite,
                    // An explicit null partition key creates the unpartitioned
                    // counterpart of a partitioned cookie.
                    partitionKey: null,
                });
                copied.push({ name: cookie.name, path, domain: host });
            } catch {
                // Some cookies cannot be set from an extension context. Skip
                // them; the request may still succeed.
            }
        }

        for (const copy of copied) this.#retain(copy);
        return copied;
    }

    /** Whether an unpartitioned cookie with this name and path already exists. */
    async #hasUnpartitioned(host: string, path: string, name: string): Promise<boolean> {
        if (this.#copied.has(copyKey({ name, path, domain: host }))) return false;
        try {
            const existing = await this.#api.getAll({ url: `https://${host}${path}` });
            return existing.some(
                (cookie) => !cookie.partitionKey && cookie.name === name && cookie.path === path,
            );
        } catch {
            return false;
        }
    }

    /**
     * Remove the cookies copied for a domain.
     *
     * Only the copies this request made are removed, and only once no other
     * request is using them.
     *
     * @param domain The domain the request was for.
     * @param copies The copies this request made.
     */
    async removeForDomain(domain: string, copies: CopiedCookie[]): Promise<void> {
        for (const copy of copies) {
            const key = copyKey(copy);
            const record = this.#copied.get(key);
            if (record) {
                record.refs -= 1;
                // Another request is still using this copy: it stays in the
                // jar until the last one is finished with it.
                if (record.refs > 0) continue;
                this.#copied.delete(key);
            }

            try {
                await this.#api.remove({
                    url: `https://${copy.domain}${copy.path}`,
                    name: copy.name,
                    path: copy.path,
                });
            } catch {
                // Best effort. A cookie that cannot be removed will expire
                // on its own.
            }
        }
    }

    /**
     * Remove every cookie this bridge has copied.
     *
     * Called when a download finishes or is cancelled, so a long run cannot
     * accumulate copies.
     */
    async removeAll(): Promise<void> {
        const records = [...this.#copied.values()];
        this.#copied.clear();
        for (const { copy } of records) {
            try {
                await this.#api.remove({
                    url: `https://${copy.domain}${copy.path}`,
                    name: copy.name,
                    path: copy.path,
                });
            } catch {
                // Best effort, as above.
            }
        }
    }

    /** Remember a copy, and note that this request is using it. */
    #retain(copy: CopiedCookie): void {
        const key = copyKey(copy);
        const record = this.#copied.get(key);
        if (record) {
            record.refs += 1;
            return;
        }
        this.#copied.set(key, { copy, refs: 1 });
    }

    /** The cookies currently copied, for diagnostics. */
    get copiedCookies(): ReadonlyMap<string, string[]> {
        const summary = new Map<string, string[]>();
        for (const { copy } of this.#copied.values()) {
            const names = summary.get(copy.domain) ?? [];
            names.push(copy.name);
            summary.set(copy.domain, names);
        }
        return summary;
    }
}

/**
 * Whether a cookie's domain covers the target domain.
 *
 * A cookie set on `.example.com` applies to `www.example.com`, but a cookie
 * set on `other.com` does not.
 */
function isCookieForDomain(cookieDomain: string, targetDomain: string): boolean {
    const cookie = cookieDomain.replace(/^\./, "").toLowerCase();
    const target = targetDomain.toLowerCase();
    if (cookie === target) return true;
    return target.endsWith(`.${cookie}`);
}

/** The registrable domain of a hostname, re-exported for convenience. */
export { registrableDomain };
