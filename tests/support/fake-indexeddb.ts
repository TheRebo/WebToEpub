/**
 * A small IndexedDB, for tests.
 *
 * `happy-dom` — the environment the unit tests run in — has no IndexedDB at
 * all, which meant the library store, where the user's books live, had no
 * tests. This is a small implementation of the parts the store uses:
 *
 *  - `factory.open(name, version)`, with the upgrade and success events.
 *  - `db.transaction(store, mode)`, with the complete, abort and error events.
 *  - `store.put`, `get`, `getAll`, `delete` and `clear`.
 *  - `store.index(name).getAll(value)`.
 *
 * Two behaviours are modelled deliberately, because the store depends on them:
 *
 *  - A **read-write** transaction on a store runs to completion before the next
 *    one starts, and the requests it makes do not run until the transaction
 *    itself becomes active. Real IndexedDB does this, and it is what makes a
 *    read and a write inside one transaction atomic with respect to every
 *    other transaction.
 *
 *  - A request's success handler runs in a later turn, and the operations it
 *    queues are part of the same transaction.
 *
 * It is not a general implementation, and it is not fast. It is a test double
 * that behaves the way the code expects the browser to behave.
 */

/** A request, as the browser's API reports one. */
class FakeRequest<T> {
    /** The request's result. */
    result!: T;

    /** The request's error, if it failed. */
    error: Error | null = null;

    /** Called when the request succeeds. */
    onsuccess: ((event: unknown) => void) | null = null;

    /** Called when the request fails. */
    onerror: ((event: unknown) => void) | null = null;

    /** Called when the open needs to install a new version. */
    onupgradeneeded: ((event: unknown) => void) | null = null;

    /** Called when the open is blocked. */
    onblocked: ((event: unknown) => void) | null = null;

    /** Whether the request has succeeded. */
    onsuccessCalled = false;

    /** Resolve the request, and call the success handler. */
    succeed(result: T): void {
        this.result = result;
        // The browser delivers the event in a later turn, so a handler
        // attached after the call still sees it.
        queueMicrotask(() => {
            this.onsuccessCalled = true;
            this.onsuccess?.({ target: this });
        });
    }

    /** Set the result without delivering the event yet. */
    setResult(result: T): void {
        this.result = result;
    }

    /** Fail the request, and call the error handler. */
    fail(error: Error): void {
        this.error = error;
        queueMicrotask(() => {
            this.onerror?.({ target: this });
        });
    }
}

/**
 * Wait for every pending microtask, and then for the next turn.
 *
 * @returns A promise that resolves after the delay.
 */
function tick(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

/** The shared data of a store. */
class StoreData {
    /** The store's records, by key. */
    readonly records = new Map<string, unknown>();

    /** The store's index key paths, by name. */
    readonly indexPaths = new Map<string, string>();

    constructor(readonly keyPath: string) {}
}

/** The store's operations, as they run against the data. */
class StoreOperations {
    constructor(private readonly data: StoreData) {}

    /** Put a record. */
    put(value: unknown): FakeRequest<IDBValidKey> {
        const request = new FakeRequest<IDBValidKey>();
        const key = (value as Record<string, unknown>)[this.data.keyPath] as IDBValidKey;
        this.data.records.set(String(key), value);
        request.succeed(key);
        return request;
    }

    /** Read a record. */
    get(key: IDBValidKey): FakeRequest<unknown> {
        const request = new FakeRequest<unknown>();
        request.succeed(this.data.records.get(String(key)));
        return request;
    }

    /** Read every record. */
    getAll(): FakeRequest<unknown[]> {
        const request = new FakeRequest<unknown[]>();
        request.succeed([...this.data.records.values()]);
        return request;
    }

    /** Every record whose key path has the given value. */
    getAllByIndex(name: string, value: unknown): FakeRequest<unknown[]> {
        const request = new FakeRequest<unknown[]>();
        const keyPath = this.data.indexPaths.get(name);
        if (!keyPath) throw new Error(`No such index: ${name}`);
        const matches = [...this.data.records.values()].filter(
            (record) => (record as Record<string, unknown>)[keyPath] === value,
        );
        request.succeed(matches);
        return request;
    }

    /** Remove a record. */
    delete(key: IDBValidKey): FakeRequest<undefined> {
        const request = new FakeRequest<undefined>();
        this.data.records.delete(String(key));
        request.succeed(undefined);
        return request;
    }

    /** Remove every record. */
    clear(): FakeRequest<undefined> {
        const request = new FakeRequest<undefined>();
        this.data.records.clear();
        request.succeed(undefined);
        return request;
    }
}

/** An index over a store, as seen from inside a transaction. */
class TransactionIndex {
    constructor(
        private readonly transaction: FakeTransaction,
        private readonly name: string,
    ) {}

    /** Every entry whose key path has the given value. */
    getAll(value: unknown): FakeRequest<unknown[]> {
        return this.transaction.enqueue(() =>
            this.transaction.operations.getAllByIndex(this.name, value),
        );
    }
}

/** A store, as seen from inside a transaction. */
class TransactionStore {
    constructor(private readonly transaction: FakeTransaction) {}

    /** Put a record. */
    put(value: unknown): FakeRequest<IDBValidKey> {
        return this.transaction.enqueue(() => this.transaction.operations.put(value));
    }

    /** Read a record. */
    get(key: IDBValidKey): FakeRequest<unknown> {
        return this.transaction.enqueue(() => this.transaction.operations.get(key));
    }

    /** Read every record. */
    getAll(): FakeRequest<unknown[]> {
        return this.transaction.enqueue(() => this.transaction.operations.getAll());
    }

    /** An index, by name. */
    index(name: string): TransactionIndex {
        return new TransactionIndex(this.transaction, name);
    }

    /** Remove a record. */
    delete(key: IDBValidKey): FakeRequest<undefined> {
        return this.transaction.enqueue(() => this.transaction.operations.delete(key));
    }

    /** Remove every record. */
    clear(): FakeRequest<undefined> {
        return this.transaction.enqueue(() => this.transaction.operations.clear());
    }
}

/** A transaction. */
class FakeTransaction {
    /** Called when the transaction commits. */
    oncomplete: ((event: unknown) => void) | null = null;

    /** Called when the transaction is aborted. */
    onabort: ((event: unknown) => void) | null = null;

    /** Called when the transaction fails. */
    onerror: ((event: unknown) => void) | null = null;

    /** Whether the transaction has been aborted. */
    aborted = false;

    /** The operations the transaction has yet to run. */
    readonly #operations: Array<() => void> = [];

    constructor(
        readonly operations: StoreOperations,
        readonly mode: IDBTransactionMode,
    ) {}

    /** The store the transaction works on. */
    objectStore(_name: string): TransactionStore {
        return new TransactionStore(this);
    }

    /**
     * Queue an operation, and return the request that will report its result.
     *
     * The operation does not run until the transaction is active, and the
     * request's success handler runs in a later turn — as it does in a browser.
     *
     * @param operation The operation to run.
     * @returns The request.
     */
    enqueue<T>(operation: () => FakeRequest<T>): FakeRequest<T> {
        const request = new FakeRequest<T>();
        this.#operations.push(() => {
            const inner = operation();
            inner.onsuccess = () => {
                request.succeed(inner.result);
            };
            inner.onerror = () => {
                request.fail(inner.error ?? new Error("The request failed."));
            };
        });
        return request;
    }

    /**
     * Run the transaction's operations, in order.
     *
     * An operation queued by a success handler is part of the same
     * transaction, and runs before the transaction commits.
     */
    async drain(): Promise<void> {
        // The caller queues its first request straight after the transaction
        // is created, so the drain waits for that to happen before it looks
        // for work.
        await tick();
        while (this.#operations.length > 0) {
            const operation = this.#operations.shift();
            if (!operation) break;
            operation();
            // Let the request's success handler run, and anything it queues.
            await tick();
        }
    }

    /** Abort the transaction. */
    abort(): void {
        this.aborted = true;
        this.onabort?.({ target: this });
    }
}

/** A database. */
class FakeDatabase {
    /** The names of the object stores. */
    readonly objectStoreNames = {
        contains: (name: string) => this.stores.has(name),
    };

    /** The database's stores, by name. */
    readonly stores = new Map<string, StoreData>();

    /** The database's index paths, by store and index. */
    readonly #operations = new Map<string, StoreOperations>();

    /** Called when the database is closed. */
    onclose: ((event: unknown) => void) | null = null;

    /** The queue of read-write transactions: one at a time. */
    #queue: Promise<void> = Promise.resolve();

    /** Create an object store. */
    createObjectStore(
        name: string,
        options: { keyPath: string },
    ): {
        createIndex(indexName: string, keyPath: string): unknown;
    } {
        const data = new StoreData(options.keyPath);
        this.stores.set(name, data);
        const operations = new StoreOperations(data);
        this.#operations.set(name, operations);

        return {
            createIndex: (indexName: string, keyPath: string) => {
                data.indexPaths.set(indexName, keyPath);
                return {};
            },
        };
    }

    /** Start a transaction. */
    transaction(name: string, mode: IDBTransactionMode): FakeTransaction {
        const operations = this.#operations.get(name);
        if (!operations) throw new Error(`No such object store: ${name}`);

        const transaction = new FakeTransaction(operations, mode);

        if (mode === "readonly") {
            // A read does not wait for the write in front of it, but it does
            // see the store as it is now.
            void transaction.drain().then(() => {
                transaction.oncomplete?.({ target: transaction });
            });
            return transaction;
        }

        // A read-write transaction waits for the one in front of it, and
        // commits before the next one starts.
        const previous = this.#queue;
        let release: () => void = () => {};
        this.#queue = new Promise<void>((resolve) => {
            release = resolve;
        });

        void previous.then(async () => {
            await transaction.drain();
            if (!transaction.aborted) transaction.oncomplete?.({ target: transaction });
            release();
        });

        return transaction;
    }

    /** Close the database. */
    close(): void {
        this.onclose?.({ target: this });
    }
}

/** An open request. */
class FakeOpenRequest extends FakeRequest<FakeDatabase> {
    /** The database the request opened. */
    declare result: FakeDatabase;
}

/** A factory, as the browser's `indexedDB` global. */
export class FakeIndexedDb {
    /** The databases this factory has opened, by name. */
    readonly databases = new Map<string, FakeDatabase>();

    /**
     * Open a database.
     *
     * @param name The database's name.
     * @param version The database's version.
     * @returns The open request.
     */
    open(name: string, version: number): FakeOpenRequest {
        const request = new FakeOpenRequest();
        let database = this.databases.get(name);
        const isNew = !database;

        if (!database) {
            database = new FakeDatabase();
            this.databases.set(name, database);
        }

        queueMicrotask(() => {
            if (isNew) {
                // The database is available to the upgrade handler, as it is in
                // the browser.
                request.setResult(database as FakeDatabase);
                request.onupgradeneeded?.({ target: request });
            }
            request.succeed(database as FakeDatabase);
        });

        void version;
        return request;
    }

    /**
     * Delete a database.
     *
     * @param name The database's name.
     * @returns The request.
     */
    deleteDatabase(name: string): FakeRequest<undefined> {
        const request = new FakeRequest<undefined>();
        this.databases.delete(name);
        queueMicrotask(() => request.succeed(undefined));
        return request;
    }
}

/**
 * A factory that behaves like the browser's.
 *
 * @returns The factory.
 */
export function createFakeIndexedDb(): IDBFactory {
    return new FakeIndexedDb() as unknown as IDBFactory;
}
