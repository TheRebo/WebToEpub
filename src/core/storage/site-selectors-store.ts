/**
 * The per-site selector store.
 *
 * When no parser matches a site, Kintsugi falls back to the default parser.
 * The default parser works on a guess; a *saved* selector works on an answer.
 * This store keeps the answer — the CSS selectors the user wrote for a host
 * name — so the next visit to that site is handled correctly the first time.
 *
 * The baseline kept these in `window.localStorage`, under the key
 * `DefaultParserConfigs`, as a JSON array of `[hostName, selectors]` pairs.
 * Two things were wrong with that:
 *
 *  - `localStorage` is not available in a background service worker, and the
 *    rewrite moved the parsers there;
 *  - the value was never validated, so a hand-edited entry could put anything
 *    into the DOM.
 *
 * The rewrite keeps the data in `browser.storage.local` under a namespaced key,
 * validates it on read, and re-generates the CSS selectors from the DOM
 * rather than trusting them.
 *
 * See ADR-0002, ADR-0004 and ADR-0011.
 */

import { isParsableSelector } from "../util/css";

/** The selectors saved for one host name. */
export interface SiteSelectorConfig {
    /** The selector that holds the chapter's body. */
    contentCss: string;
    /** The selector that holds the chapter's title. */
    titleCss: string;
    /** The selector that holds the elements to strip from the body. */
    removeCss: string;
    /** The URL the selectors were tested against. */
    testUrl: string;
}

/** The storage key. */
export const SITE_SELECTORS_KEY = "kintsugi.siteSelectors";

/** The storage API the store depends on. */
export interface SiteSelectorStorage {
    get(keys: string | string[] | null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
}

/** An empty configuration. */
export function emptySiteSelectorConfig(): SiteSelectorConfig {
    return { contentCss: "", titleCss: "", removeCss: "", testUrl: "" };
}

/**
 * Validate a stored configuration.
 *
 * Every field must be a string, and the CSS selectors must be ones the browser
 * can actually parse. A selector that throws when it is used is worse than no
 * selector at all, because it takes the whole chapter down with it.
 */
export function validateSiteSelectorConfig(value: unknown): SiteSelectorConfig | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;

    const contentCss = source.contentCss;
    if (typeof contentCss !== "string" || contentCss.trim() === "") return null;
    if (!isParsableSelector(contentCss)) return null;

    return {
        contentCss,
        titleCss: typeof source.titleCss === "string" ? source.titleCss : "",
        removeCss: typeof source.removeCss === "string" ? source.removeCss : "",
        testUrl: typeof source.testUrl === "string" ? source.testUrl : "",
    };
}

/**
 * The host name a URL belongs to, lower-cased and without a leading `www.`.
 *
 * This is the **only** place a host name is normalised. Every writer and every
 * reader of the store — the workbench, the background worker, the new default
 * parser and the migrated one — goes through it, so a saved configuration is
 * always found again.
 */
export function normaliseHostName(hostName: string): string {
    const trimmed = hostName.trim().toLowerCase();
    return trimmed.startsWith("www.") ? trimmed.substring(4) : trimmed;
}

/**
 * Normalise and validate a host name that came from outside the extension.
 *
 * The store is keyed by host name, and the host name decides **which site** a
 * set of CSS selectors is applied to. A name that is not a plain host name —
 * one that carries a scheme, a path, a port, a query, a wildcard or a
 * credential — does not name a host at all, and accepting it would let a
 * caller file a configuration under a key that no lookup will ever produce.
 *
 * The canonical form comes from the URL parser rather than from a regular
 * expression, so it agrees with the parser the rest of the extension uses:
 *
 * ```text
 * validateHostName("https://Example.COM/x") === "example.com"
 * validateHostName("www.example.com")          === "example.com"
 * validateHostName("example.com:8080")         === "example.com"
 * ```
 *
 * @param hostName The host name to validate.
 * @returns The normalised host name, or `null` when it does not name a host.
 */
export function validateHostName(hostName: string): string | null {
    const trimmed = hostName.trim();
    if (trimmed === "") return null;

    // A name that already carries a scheme, or that looks like a whole URL,
    // is not a host name. Rejecting it here keeps the key space to hosts and
    // nothing else.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return null;
    if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) return null;
    if (trimmed.includes("@")) return null;
    if (trimmed.includes("*")) return null;

    let parsed: URL;
    try {
        parsed = new URL(`https://${trimmed}`);
    } catch {
        return null;
    }

    // The URL parser is the authority on what a host name looks like. It
    // rejects a name with a space or a control character, and it strips the
    // port, which is not part of a host name.
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "") return null;
    if (hostname.includes("*")) return null;

    // A trailing dot names the same host as the name without it.
    const withoutDot = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
    if (withoutDot === "") return null;

    return normaliseHostName(withoutDot);
}

/**
 * The store.
 *
 * The store keeps a cache so that a parser — which runs synchronously inside
 * the download pipeline — can read a saved configuration without awaiting.
 * The cache is filled by {@link SiteSelectorStore.hydrate}, which the worker
 * calls once at start-up.
 */
export class SiteSelectorStore {
    #storage: SiteSelectorStorage;
    #cache: Map<string, SiteSelectorConfig> | null = null;
    /**
     * The queue of pending writes.
     *
     * Saving a configuration is a read-modify-write: the saved configurations
     * are read, one of them is changed, and the whole set is written back.
     * Two overlapping saves would each read the same snapshot, and the second
     * write would discard the first one's change.
     */
    #queue: Promise<unknown> = Promise.resolve();

    constructor(storage: SiteSelectorStorage) {
        this.#storage = storage;
    }

    /**
     * Load the saved configurations into the cache.
     *
     * Called once when the worker starts. Until it resolves, the parsers see
     * no saved configurations, which is the same state the baseline was in
     * before its `localStorage` read finished.
     *
     * The read is queued with the writes, so that a read cannot install a
     * snapshot that a write has already made out of date.
     */
    async hydrate(): Promise<void> {
        await this.#enqueue(async () => {
            await this.#read();
        });
    }

    /**
     * Read the saved configurations into the cache.
     *
     * This is the read itself, without the queue. It is called from inside a
     * queued write, where waiting for the queue would be a deadlock.
     */
    async #read(): Promise<void> {
        const stored = await this.#storage.get(SITE_SELECTORS_KEY);
        const raw = stored[SITE_SELECTORS_KEY];
        const configs = new Map<string, SiteSelectorConfig>();

        if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
            for (const [hostName, value] of Object.entries(raw as Record<string, unknown>)) {
                const config = validateSiteSelectorConfig(value);
                if (!config) continue;
                // A key that is not a host name is dropped rather than
                // normalised: a hand-edited entry must not become a live
                // configuration under a key that was never asked for.
                const key = validateHostName(hostName);
                if (key === null) continue;
                configs.set(key, config);
            }
        }

        this.#cache = configs;
    }

    /** Whether the cache has been filled. */
    get hydrated(): boolean {
        return this.#cache !== null;
    }

    /**
     * The configuration for a host name, from the cache.
     *
     * Synchronous on purpose: the parsers call it from inside a synchronous
     * method.
     */
    peek(hostName: string): SiteSelectorConfig | null {
        return this.#cache?.get(normaliseHostName(hostName)) ?? null;
    }

    /** Every saved configuration, from the cache. */
    peekAll(): Map<string, SiteSelectorConfig> {
        return new Map(this.#cache ?? []);
    }

    /** The configuration for a host name. */
    async getForHost(hostName: string): Promise<SiteSelectorConfig | null> {
        await this.#hydrateIfNeeded();
        return this.peek(hostName);
    }

    /** Every saved configuration, keyed by host name. */
    async list(): Promise<Map<string, SiteSelectorConfig>> {
        await this.#hydrateIfNeeded();
        return this.peekAll();
    }

    /** Save the configuration for a host name. */
    async setForHost(hostName: string, config: SiteSelectorConfig): Promise<void> {
        const key = validateHostName(hostName);
        if (key === null) throw new Error("The host name is not a host name.");

        const validated = validateSiteSelectorConfig(config);
        if (validated === null) throw new Error("The content selector is not usable.");

        await this.#enqueue(async () => {
            if (this.#cache === null) await this.#read();
            const cache = new Map(this.#cache ?? []);
            cache.set(key, validated);
            // The cache is only replaced once the write has succeeded, so a
            // failed write does not leave the store claiming a configuration
            // that was never saved.
            await this.#persist(cache);
            this.#cache = cache;
        });
    }

    /** Forget the configuration for a host name. */
    async removeForHost(hostName: string): Promise<void> {
        const key = validateHostName(hostName);
        // A name that is not a host name cannot be in the cache, so there is
        // nothing to forget and nothing to write.
        if (key === null) return;

        await this.#enqueue(async () => {
            if (this.#cache === null) await this.#read();
            const cache = new Map(this.#cache ?? []);
            cache.delete(key);
            await this.#persist(cache);
            this.#cache = cache;
        });
    }

    /**
     * Run work after everything already queued.
     *
     * The queue is not broken by a failure — the next write still has to run
     * — but the failure is reported to whoever asked for the work.
     *
     * @param work The work to do.
     * @returns Whatever the work returned.
     */
    async #enqueue<T>(work: () => Promise<T>): Promise<T> {
        const result = this.#queue.then(work);
        this.#queue = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    /** Fill the cache, if it is not already filled. */
    async #hydrateIfNeeded(): Promise<void> {
        if (this.#cache === null) await this.hydrate();
    }

    /** Write the cache to storage. */
    async #persist(cache: Map<string, SiteSelectorConfig>): Promise<void> {
        const plain: Record<string, SiteSelectorConfig> = {};
        for (const [hostName, config] of cache) plain[hostName] = config;
        await this.#storage.set({ [SITE_SELECTORS_KEY]: plain });
    }
}
