/**
 * The ambient types for the extension.
 *
 * Firefox exposes the promise-based `browser.*` namespace; Chromium exposes
 * the callback-based `chrome.*`. The `chrome` types come from the
 * `@types/chrome` package, but there is no equivalent for `browser`, so the
 * small part of it Kintsugi uses is declared here.
 *
 * Only the members that are actually referenced are declared. A wider
 * declaration would be a lie about what the code depends on.
 */

declare namespace browser {
    /** The runtime namespace. */
    const runtime: {
        /** The extension's own URL for a path. */
        getURL(path: string): string;
        /** Send a message to the extension. */
        sendMessage(message: unknown): Promise<unknown>;
        /** The message listener. */
        onMessage: {
            /** Add a listener. */
            addListener(
                listener: (
                    message: unknown,
                    sender: unknown,
                    sendResponse: (response?: unknown) => void,
                ) => boolean | void | Promise<unknown>,
            ): void;
            /** Remove a listener. */
            removeListener(listener: (...args: never[]) => unknown): void;
        };
        /** The manifest. */
        getManifest(): { version: string };
        /** The extension's ID. */
        id: string;
    };

    /** The storage namespace. */
    const storage: {
        /** The persistent local store. */
        local: {
            get(keys: string | string[] | null): Promise<Record<string, unknown>>;
            set(items: Record<string, unknown>): Promise<void>;
            remove(keys: string | string[]): Promise<void>;
            clear?(): Promise<void>;
        };
        /** The per-session store. */
        session?:
            | {
                  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
                  set(items: Record<string, unknown>): Promise<void>;
                  remove(keys: string | string[]): Promise<void>;
              }
            | undefined;
    };

    /** The tabs namespace. */
    const tabs: {
        query(
            query: Record<string, unknown>,
        ): Promise<Array<{ id?: number; url?: string; title?: string; active?: boolean }>>;
        create(options: { url?: string; active?: boolean }): Promise<{ id?: number }>;
        sendMessage(tabId: number, message: unknown): Promise<unknown>;
    };

    /** The permissions namespace. */
    const permissions: {
        contains(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
        request(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
        remove(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
        getAll(): Promise<{ origins?: string[]; permissions?: string[] }>;
    };

    /** The cookies namespace. */
    const cookies: {
        getAll(details: { url: string; name?: string }): Promise<
            Array<{
                name: string;
                value: string;
                domain?: string;
                path?: string;
                secure?: boolean;
                sameSite?: string;
                partitionKey?: unknown;
            }>
        >;
        set(details: Record<string, unknown>): Promise<void>;
        remove(details: { url: string; name: string; partitionKey?: unknown }): Promise<void>;
    };

    /** The downloads namespace. */
    const downloads: {
        download(options: {
            url: string;
            filename?: string;
            saveAs?: boolean;
            conflictAction?: string;
        }): Promise<number>;
    };

    /** The declarative network request namespace. */
    const declarativeNetRequest: {
        updateDynamicRules(options: {
            removeRuleIds?: number[];
            addRules?: unknown[];
        }): Promise<void>;
        getDynamicRules(): Promise<Array<{ id: number }>>;
        updateSessionRules(options: {
            removeRuleIds?: number[];
            addRules?: unknown[];
        }): Promise<void>;
        getSessionRules(): Promise<Array<{ id: number }>>;
    };

    /** The scripting namespace. */
    const scripting:
        | {
              executeScript(options: {
                  target: { tabId: number };
                  func?: (...args: never[]) => unknown;
                  files?: string[];
              }): Promise<Array<{ result?: unknown }>>;
          }
        | undefined;

    /** The internationalisation namespace. */
    const i18n: {
        getMessage(key: string, substitutions?: string | string[]): string;
        getUILanguage(): string;
    };

    /** The theme namespace. */
    const theme:
        | {
              onUpdated: { addListener(listener: () => void): void };
          }
        | undefined;
}
