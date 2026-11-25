/**
 * The library store.
 *
 * The library holds the user's books. The baseline stored each EPUB as a
 * **base64 data URL** in `chrome.storage.local`, which inflated the file by
 * a third, exceeded the 10 MB per-item quota, and required the
 * `unlimitedStorage` permission purely as a consequence.
 *
 * Here the bytes go into IndexedDB, which stores them natively, writes
 * transactionally, and needs no blanket quota permission.
 *
 * See ADR-0006.
 */

/** A book in the library. */
export interface LibraryEntry {
    /** The entry's ID. */
    id: string;
    /** The story's title. */
    title: string;
    /** The author. */
    author?: string;
    /** The source URL. */
    sourceUrl: string;
    /** The chapter count. */
    chapterCount: number;
    /** The size, in bytes. */
    size: number;
    /** When it was added, as an epoch milliseconds value. */
    addedAt: number;
    /** When it was last updated, as an epoch milliseconds value. */
    updatedAt: number;
    /** The cover image's bytes, if there is one. */
    cover?: Uint8Array;
    /** The cover's media type. */
    coverMediaType?: string;
    /** The chapter URLs, so an incremental update can diff against them. */
    chapterUrls: string[];
}

/** The database name. */
export const LIBRARY_DB_NAME = "kintsugi-library";

/** The database version. */
export const LIBRARY_DB_VERSION = 1;

/** The object store name. */
export const LIBRARY_STORE = "books";

/**
 * Open the library database, creating the schema if needed.
 */
export function openLibraryDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(LIBRARY_DB_NAME, LIBRARY_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
                const store = db.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
                store.createIndex("sourceUrl", "sourceUrl", { unique: false });
                store.createIndex("updatedAt", "updatedAt", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("Could not open the library database."));
        request.onblocked = () =>
            reject(new Error("The library database is blocked by another open tab."));
    });
}

/**
 * The library store.
 */
export class LibraryStore {
    #db: IDBDatabase | undefined;

    constructor(private readonly factory: IDBFactory = indexedDB) {}

    /** The open database, opening it if necessary. */
    async #database(): Promise<IDBDatabase> {
        if (!this.#db) this.#db = await openLibraryDatabase(this.factory);
        return this.#db;
    }

    /**
     * Run a transaction against the store.
     *
     * A **read-write** transaction is only durable once it has *committed*.
     * Resolving on the request's success event would report a write as done
     * while the transaction was still open, and a transaction that then
     * aborted — a quota error, a browser eviction — would leave the caller
     * believing the write had happened when it had not.
     *
     * So a write waits for the transaction's `complete` event, and a read
     * resolves on the request's success, which is all a read needs.
     */
    async #withStore<T>(
        mode: IDBTransactionMode,
        action: (store: IDBObjectStore) => IDBRequest<T>,
    ): Promise<T> {
        const db = await this.#database();
        return new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(LIBRARY_STORE, mode);
            const store = transaction.objectStore(LIBRARY_STORE);
            const request = action(store);

            let result: T | undefined;
            let failed = false;

            request.onsuccess = () => {
                result = request.result;
                if (mode === "readonly") resolve(result as T);
            };
            request.onerror = () => {
                failed = true;
                reject(request.error ?? new Error("Library request failed."));
            };

            transaction.oncomplete = () => {
                if (failed) return;
                resolve(result as T);
            };
            transaction.onabort = () => {
                failed = true;
                reject(transaction.error ?? new Error("Library transaction aborted."));
            };
            transaction.onerror = () => {
                failed = true;
                reject(transaction.error ?? new Error("Library transaction failed."));
            };
        });
    }

    /** Every entry, most recently updated first. */
    async list(): Promise<LibraryEntry[]> {
        const entries = await this.#withStore("readonly", (store) => store.getAll());
        return (entries as LibraryEntry[]).sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** One entry, or `null`. */
    async get(id: string): Promise<LibraryEntry | null> {
        const entry = await this.#withStore("readonly", (store) => store.get(id));
        return (entry as LibraryEntry | undefined) ?? null;
    }

    /** The entry for a source URL, or `null`. */
    async findBySourceUrl(sourceUrl: string): Promise<LibraryEntry | null> {
        const entries = await this.#withStore("readonly", (store) =>
            store.index("sourceUrl").getAll(sourceUrl),
        );
        const matches = (entries as LibraryEntry[]).filter(
            (entry) => entry.sourceUrl === sourceUrl,
        );
        return matches[0] ?? null;
    }

    /** Add or replace an entry. */
    async put(entry: LibraryEntry): Promise<void> {
        await this.#withStore("readwrite", (store) => store.put(entry));
    }

    /** Remove an entry. */
    async delete(id: string): Promise<void> {
        await this.#withStore("readwrite", (store) => store.delete(id));
    }

    /**
     * Remove every entry.
     *
     * Unlike the baseline's `chrome.storage.local.clear()`, this touches
     * only the library store.
     */
    async clear(): Promise<void> {
        await this.#withStore("readwrite", (store) => store.clear());
    }

    /** The total size of the library, in bytes. */
    async totalSize(): Promise<number> {
        const entries = await this.list();
        return entries.reduce((sum, entry) => sum + entry.size, 0);
    }

    /** Close the database. */
    close(): void {
        this.#db?.close();
        this.#db = undefined;
    }
}
