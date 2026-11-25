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
 * A cookie this bridge copied.
 *
 * The path is remembered because the browser identifies a cookie by its
 * domain, its path *and* its name. A cookie copied at `/app` is not the same
 * cookie as one at `/`, so removing it has to name the same path.
 */
interface CopiedCookie {
    /** The cookie's name. */
    name: string;
    /** The path the copy was set at. */
    path: string;
}

/** The bridge. */
export class CookieBridge {
    #api: CookieApi;
    /** The cookies copied for each domain, so they can be removed later. */
    #copied = new Map<string, CopiedCookie[]>();

    constructor(api: CookieApi) {
        this.#api = api;
    }

    /**
     * Copy the partitioned cookies for a domain into unpartitioned ones.
     *
     * @returns The cookies that were copied.
     */
    async copyForDomain(domain: string): Promise<string[]> {
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
            try {
                await this.#api.set({
                    url: `https://${cookie.domain.replace(/^\./, "")}${path}`,
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
                copied.push({ name: cookie.name, path });
            } catch {
                // Some cookies cannot be set from an extension context. Skip
                // them; the request may still succeed.
            }
        }

        if (copied.length > 0) {
            const existing = this.#copied.get(domain) ?? [];
            const merged = [...existing, ...copied];
            // The same cookie can be copied twice, and the second copy
            // replaces the first, so only one entry is kept for each
            // name-and-path pair.
            const unique = new Map(merged.map((entry) => [`${entry.path}::${entry.name}`, entry]));
            this.#copied.set(domain, [...unique.values()]);
        }
        return copied.map((entry) => entry.name);
    }

    /**
     * Remove the cookies copied for a domain.
     *
     * The removal names the same path the copy was set at. The browser
     * identifies a cookie by its domain, its path and its name, so a copy
     * made at `/app` is not removed by a request for `https://domain/` — the
     * path does not match — and the copy would stay in the jar, being sent
     * with every later request to that host.
     */
    async removeForDomain(domain: string, names: string[]): Promise<void> {
        for (const name of names) {
            const entries = (this.#copied.get(domain) ?? []).filter((entry) => entry.name === name);
            // A cookie that was never recorded — because the bridge was
            // rebuilt, say — is removed at the root path, which is where a
            // cookie with no path of its own would be.
            const paths = entries.length > 0 ? entries.map((entry) => entry.path) : ["/"];

            for (const path of paths) {
                try {
                    await this.#api.remove({
                        url: `https://${domain}${path}`,
                        name,
                        path,
                    });
                } catch {
                    // Best effort. A cookie that cannot be removed will expire
                    // on its own.
                }
            }
        }
        const remaining = (this.#copied.get(domain) ?? []).filter(
            (entry) => !names.includes(entry.name),
        );
        if (remaining.length === 0) this.#copied.delete(domain);
        else this.#copied.set(domain, remaining);
    }

    /**
     * Remove every cookie this bridge has copied.
     *
     * Called when a download finishes or is cancelled, so a long run cannot
     * accumulate copies.
     */
    async removeAll(): Promise<void> {
        const domains = [...this.#copied.keys()];
        for (const domain of domains) {
            const names = (this.#copied.get(domain) ?? []).map((entry) => entry.name);
            await this.removeForDomain(domain, names);
        }
        this.#copied.clear();
    }

    /** The cookies currently copied, for diagnostics. */
    get copiedCookies(): ReadonlyMap<string, string[]> {
        const summary = new Map<string, string[]>();
        for (const [domain, entries] of this.#copied) {
            summary.set(
                domain,
                entries.map((entry) => entry.name),
            );
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
