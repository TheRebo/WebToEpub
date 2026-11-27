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
 *
 * A blocked open — another tab holding the database — is not a failure. The
 * request waits until the other tab lets go, and then succeeds. It is
 * reported through the `onblocked` callback, so that the caller can tell the
 * user why the extension is waiting, but the promise is only rejected if the
 * request itself fails.
 *
 * @param factory The database factory to open with.
 * @param onBlocked Called when the open is blocked by another connection.
 * @returns The open database.
 */
export function openLibraryDatabase(
    factory: IDBFactory = indexedDB,
    onBlocked?: () => void,
): Promise<IDBDatabase> {
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
        // The request stays pending while it is blocked. It is not an error,
        // and rejecting here would abandon a request that would have
        // succeeded — and leave its database handle open for ever.
        request.onblocked = () => onBlocked?.();
    });
}

/**
 * Merge a new entry into an existing one for the same story.
 *
 * A story that is downloaded twice is one book, not two. The second run
 * updates the entry that is already there: it keeps the entry's ID and the
 * date it was first added, so that a re-download does not make an old book
 * look new, and it takes the new title, author, cover and chapter list.
 *
 * @param existing The entry that is already there, or `null` for a new story.
 * @param entry The entry that has just been produced.
 * @returns The entry to store.
 */
export function mergeLibraryEntry(
    existing: LibraryEntry | null,
    entry: LibraryEntry,
): LibraryEntry {
    if (!existing) return entry;
    return {
        ...entry,
        id: existing.id,
        addedAt: existing.addedAt,
    };
}

/**
 * The library store.
 */
export class LibraryStore {
    /**
     * The open database, or the promise of it.
     *
     * The promise is what is kept, rather than the database itself: two
     * callers that arrive at the same time would otherwise each open the
     * database, and the connection that lost the race would be left open for
     * ever. An open connection blocks the next version of the schema from
     * being installed — the browser calls it a *blocked* database — so the
     * leak is not a slow one, it is a broken one.
     */
    #opening: Promise<IDBDatabase> | undefined;

    /**
     * Build a store.
     *
     * @param factory The database factory to open with.
     * @param onBlocked Called when another connection holds the database and
     *   the open has to wait for it. A blocked open is not a failure — the
     *   request succeeds as soon as the other connection lets go — but the
     *   wait can be long enough that the user wonders what is happening.
     */
    constructor(
        private readonly factory: IDBFactory = indexedDB,
        private readonly onBlocked?: () => void,
    ) {}

    /** The open database, opening it if necessary. */
    async #database(): Promise<IDBDatabase> {
        if (!this.#opening) {
            this.#opening = openLibraryDatabase(this.factory, this.onBlocked).catch(
                (error: unknown) => {
                    // A failed open is not remembered: the next call tries again.
                    this.#opening = undefined;
                    throw error;
                },
            );
        }
        return this.#opening;
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

    /**
     * Save a book, replacing the entry for the same story if there is one.
     *
     * Without this a story that is downloaded twice appears twice in the
     * library, and the user has to clean up the duplicates by hand.
     *
     * The read and the write happen in **one** transaction. In two, two saves
     * that arrived at the same time would both read "nothing there", and both
     * would write their own entry — so the story would appear twice, which is
     * the one thing this method exists to prevent.
     */
    async save(entry: LibraryEntry): Promise<void> {
        const db = await this.#database();

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(LIBRARY_STORE, "readwrite");
            const store = transaction.objectStore(LIBRARY_STORE);
            const request = store.index("sourceUrl").getAll(entry.sourceUrl);

            let failed = false;

            request.onsuccess = () => {
                const matches = (request.result as LibraryEntry[]).filter(
                    (candidate) => candidate.sourceUrl === entry.sourceUrl,
                );
                // The write is part of the same transaction, so it cannot
                // interleave with another save's read.
                store.put(mergeLibraryEntry(matches[0] ?? null, entry));
            };

            request.onerror = () => {
                failed = true;
                reject(request.error ?? new Error("The library request failed."));
            };

            transaction.oncomplete = () => {
                if (failed) return;
                resolve();
            };
            transaction.onabort = () => {
                failed = true;
                reject(transaction.error ?? new Error("The library transaction was aborted."));
            };
            transaction.onerror = () => {
                failed = true;
                reject(transaction.error ?? new Error("The library transaction failed."));
            };
        });
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

    /**
     * Close the database.
     *
     * The close waits for the open to finish, because a database that is
     * still opening cannot be closed. A failed open is not an error here:
     * there is no database to close, and the failure has already been
     * reported to whoever asked for the data.
     */
    close(): void {
        const opening = this.#opening;
        this.#opening = undefined;
        if (!opening) return;
        void opening.then((db) => db.close()).catch(() => undefined);
    }
}
