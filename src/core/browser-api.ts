/**
 * The browser API facade.
 *
 * Firefox exposes `browser.*` as a promise-based namespace; Chrome exposes
 * `chrome.*` as a callback-based one. Rather than sprinkling that difference
 * through the codebase, this module resolves the namespace once and exposes a
 * promise-shaped API.
 *
 * It also provides a `runtime.getURL` that resolves extension-relative paths
 * correctly, and a storage adapter that satisfies the {@link SettingsStorage}
 * interface without the caller needing to know which namespace it came from.
 */

/** The shape of the `browser` namespace that Kintsugi uses. */
interface BrowserNamespace {
    runtime: {
        getURL(path: string): string;
        sendMessage(message: unknown): Promise<unknown>;
        onMessage: {
            addListener(
                listener: (
                    message: unknown,
                    sender: unknown,
                    sendResponse: (response?: unknown) => void,
                ) => boolean | void | Promise<unknown>,
            ): void;
            removeListener(listener: (...args: never[]) => unknown): void;
        };
        getManifest?(): { version: string };
        id?: string;
        lastError?: { message?: string };
    };
    storage: {
        local: {
            get(keys: string | string[] | null): Promise<Record<string, unknown>>;
            set(items: Record<string, unknown>): Promise<void>;
            remove(keys: string | string[]): Promise<void>;
            clear?(): Promise<void>;
        };
        /**
         * The storage change event.
         *
         * It is how the background worker learns that the options page has
         * changed something: the options page writes to storage directly, so
         * without this the worker would keep using the settings it read when
         * it started.
         */
        onChanged?: {
            addListener(
                listener: (
                    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
                    areaName: string,
                ) => void,
            ): void;
            removeListener(listener: (...args: never[]) => unknown): void;
        };
        session?: {
            get(keys: string | string[] | null): Promise<Record<string, unknown>>;
            set(items: Record<string, unknown>): Promise<void>;
            remove(keys: string | string[]): Promise<void>;
        };
    };
    tabs: {
        query(query: Record<string, unknown>): Promise<
            Array<{
                id?: number;
                url?: string;
                title?: string;
                active?: boolean;
                windowId?: number;
                lastAccessed?: number;
            }>
        >;
        create(options: { url?: string; active?: boolean }): Promise<{ id?: number }>;
        sendMessage(tabId: number, message: unknown): Promise<unknown>;
        onUpdated: {
            addListener(
                listener: (
                    tabId: number,
                    changeInfo: Record<string, unknown>,
                    tab: unknown,
                ) => void,
            ): void;
        };
        onActivated: {
            addListener(listener: (activeInfo: { tabId: number; windowId: number }) => void): void;
        };
    };
    permissions: {
        contains(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
        request(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
        remove(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
        getAll(): Promise<{ origins?: string[]; permissions?: string[] }>;
    };
    cookies: {
        getAll(details: { url: string; name?: string }): Promise<
            Array<{
                name: string;
                value: string;
                domain?: string;
                path?: string;
                secure?: boolean;
                httpOnly?: boolean;
                sameSite?: string;
                partitionKey?: unknown;
            }>
        >;
        set(details: Record<string, unknown>): Promise<void>;
        remove(details: { url: string; name: string; partitionKey?: unknown }): Promise<void>;
    };
    downloads: {
        download(options: {
            url: string;
            filename?: string;
            saveAs?: boolean;
            conflictAction?: string;
        }): Promise<number>;
    };
    declarativeNetRequest: {
        updateDynamicRules(options: {
            removeRuleIds?: number[];
            addRules?: unknown[];
        }): Promise<void>;
        getDynamicRules(): Promise<Array<{ id: number }>>;
    };
    scripting?: {
        executeScript(options: {
            target: { tabId: number };
            func?: (...args: never[]) => unknown;
            files?: string[];
        }): Promise<unknown[]>;
    };
    i18n: {
        getMessage(key: string, substitutions?: string | string[]): string;
        getUILanguage(): string;
    };
    theme?: {
        onUpdated: { addListener(listener: () => void): void };
    };
}

/** The resolved namespace. */
let namespace: BrowserNamespace | undefined;

/**
 * Resolve the extension namespace.
 *
 * Firefox's `browser` is preferred; Chrome's `chrome` is used as a fallback so
 * the code remains testable in a Chromium-based browser during development.
 */
export function getNamespace(): BrowserNamespace | undefined {
    if (namespace) return namespace;
    const global = globalThis as unknown as {
        browser?: BrowserNamespace;
        chrome?: BrowserNamespace;
    };
    namespace = global.browser ?? global.chrome;
    return namespace;
}

/** Set the namespace directly. Used by the tests. */
export function setNamespace(value: BrowserNamespace | undefined): void {
    namespace = value;
}

/**
 * The absolute URL for a path inside the extension.
 *
 * Falls back to the path itself when the runtime is unavailable, so a page
 * rendered outside the extension still shows something rather than throwing.
 */
export function getURL(path: string): string {
    try {
        return getNamespace()?.runtime.getURL(path) ?? path;
    } catch {
        return path;
    }
}

/** The extension's version. */
export function version(): string {
    try {
        return getNamespace()?.runtime.getManifest?.()?.version ?? "0.0.0";
    } catch {
        return "0.0.0";
    }
}

/**
 * Send a message to the background worker.
 */
export async function sendMessage(message: unknown): Promise<unknown> {
    const api = getNamespace();
    if (!api) throw new Error("The extension runtime is not available.");
    return api.runtime.sendMessage(message);
}

/**
 * Listen for messages.
 *
 * The listener may return a promise, which is how the background worker
 * answers. Firefox supports this directly; Chrome's callback style is
 * bridged by wrapping the result in `sendResponse`.
 */
export function onMessage(
    listener: (message: unknown, sender: unknown) => Promise<unknown> | undefined,
): void {
    const api = getNamespace();
    if (!api) return;
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const result = listener(message, sender);
        if (result instanceof Promise) {
            result.then(
                (value) => sendResponse(value),
                () => sendResponse(undefined),
            );
            return true;
        }
        if (result !== undefined) {
            sendResponse(result);
            return true;
        }
        return undefined;
    });
}

/**
 * The active tab in the current window.
 */
export async function activeTab(): Promise<
    { id?: number; url?: string; title?: string } | undefined
> {
    const api = getNamespace();
    if (!api) return undefined;
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}

/**
 * The address of the page the user is looking at.
 *
 * The `activeTab` permission only lets the extension see the address of the tab
 * the user invoked it from, and only while that tab stays where it is. When the
 * extension is opened from somewhere else — the options page, a bookmark — the
 * active tab is the extension's own page, and its address says nothing about
 * the story.
 *
 * So the active tab is used when it is a web page, and otherwise the most
 * recently used web page in the window is used: that is the page the user was
 * on a moment ago, which is the page they mean.
 *
 * @returns The address, or `undefined` when there is no page to speak of.
 */
export async function activePageUrl(): Promise<string | undefined> {
    const api = getNamespace();
    if (!api) return undefined;

    const tabs = await api.tabs.query({ currentWindow: true });
    const pages = tabs.filter((tab) => isWebUrl(tab.url));

    const active = pages.find((tab) => tab.active);
    if (active?.url) return active.url;

    // The most recently accessed page. Firefox reports when a tab was last
    // used; when it does not, the first web page in the list is as good a
    // guess as any.
    const recent = pages
        .filter((tab) => typeof tab.lastAccessed === "number")
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
    return recent?.url ?? pages[0]?.url;
}

/**
 * Whether an address is one the extension can work with.
 *
 * @param url The address.
 * @returns Whether it is an `http:` or `https:` address.
 */
function isWebUrl(url: string | undefined): url is string {
    if (!url) return false;
    return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Open a URL in a new tab.
 */
export async function openTab(url: string, active = true): Promise<void> {
    const api = getNamespace();
    if (!api) return;
    await api.tabs.create({ url, active });
}

/**
 * Listen for changes to the extension's storage.
 *
 * @param listener The listener. It receives the changed keys and the area they
 *   changed in.
 */
export function onStorageChanged(
    listener: (
        changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
        areaName: string,
    ) => void,
): void {
    const api = getNamespace();
    api?.storage.onChanged?.addListener(listener);
}

/**
 * The storage adapter for {@link SettingsStore}.
 *
 * `browser.storage.local` is the only place settings live; the library's EPUB
 * bytes go to IndexedDB instead.
 *
 * A write throws when the storage API is unavailable. Silently resolving
 * would tell the caller the setting was saved when it was not, and the user
 * would find their choice reverted the next time the extension started.
 */
export const localStorageAdapter = {
    async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
        const api = getNamespace();
        if (!api) return {};
        return api.storage.local.get(keys);
    },
    async set(items: Record<string, unknown>): Promise<void> {
        const api = getNamespace();
        if (!api) {
            throw new Error("The extension storage is not available.");
        }
        await api.storage.local.set(items);
    },
    async remove(keys: string | string[]): Promise<void> {
        const api = getNamespace();
        if (!api) {
            throw new Error("The extension storage is not available.");
        }
        await api.storage.local.remove(keys);
    },
};

/**
 * The session storage adapter, for checkpoints that should not survive a
 * browser restart.
 */
export const sessionStorageAdapter = {
    async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
        const api = getNamespace();
        if (!api?.storage.session) return {};
        return api.storage.session.get(keys);
    },
    async set(items: Record<string, unknown>): Promise<void> {
        const api = getNamespace();
        if (!api?.storage.session) {
            throw new Error("The extension session storage is not available.");
        }
        await api.storage.session.set(items);
    },
    async remove(keys: string | string[]): Promise<void> {
        const api = getNamespace();
        if (!api?.storage.session) {
            throw new Error("The extension session storage is not available.");
        }
        await api.storage.session.remove(keys);
    },
};
