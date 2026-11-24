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

/** The host name a URL belongs to, lower-cased and without a leading `www.`. */
export function normaliseHostName(hostName: string): string {
    const trimmed = hostName.trim().toLowerCase();
    return trimmed.startsWith("www.") ? trimmed.substring(4) : trimmed;
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

    constructor(storage: SiteSelectorStorage) {
        this.#storage = storage;
    }

    /**
     * Load the saved configurations into the cache.
     *
     * Called once when the worker starts. Until it resolves, the parsers see
     * no saved configurations, which is the same state the baseline was in
     * before its `localStorage` read finished.
     */
    async hydrate(): Promise<void> {
        const stored = await this.#storage.get(SITE_SELECTORS_KEY);
        const raw = stored[SITE_SELECTORS_KEY];
        const configs = new Map<string, SiteSelectorConfig>();

        if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
            for (const [hostName, value] of Object.entries(raw as Record<string, unknown>)) {
                const config = validateSiteSelectorConfig(value);
                if (config) configs.set(normaliseHostName(hostName), config);
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
        await this.#hydrateIfNeeded();
        const key = normaliseHostName(hostName);
        if (key === "") return;

        const validated = validateSiteSelectorConfig(config);
        if (validated === null) throw new Error("The content selector is not usable.");

        const cache = this.#cache ?? new Map<string, SiteSelectorConfig>();
        cache.set(key, validated);
        this.#cache = cache;
        await this.#persist(cache);
    }

    /** Forget the configuration for a host name. */
    async removeForHost(hostName: string): Promise<void> {
        await this.#hydrateIfNeeded();
        const key = normaliseHostName(hostName);
        const cache = this.#cache ?? new Map<string, SiteSelectorConfig>();
        cache.delete(key);
        this.#cache = cache;
        await this.#persist(cache);
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
