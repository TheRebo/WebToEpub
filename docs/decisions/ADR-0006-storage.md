# ADR-0006 — Typed storage: `browser.storage` for settings, IndexedDB for the library

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0005](ADR-0005-background-worker.md)

---

## Context

The baseline splits storage across three mechanisms with no schema, no
namespacing, and several correctness bugs:

| Store                  | Contents               | Problem                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage`         | 45 preferences         | Booleans stored as the **strings** `"true"`/`"false"`; no key namespacing; no validation on read; a corrupt value silently becomes `false`                                                                                                                                                                                        |
| `localStorage`         | `ReadingList`          | Un-namespaced key `"ReadingList"`; a hand-rolled `replacer`/`reviver` pair                                                                                                                                                                                                                                                        |
| `localStorage`         | `DefaultParserConfigs` | Un-namespaced key `"DefaultParserConfigs"`                                                                                                                                                                                                                                                                                        |
| `chrome.storage.local` | The library            | EPUBs stored as **base64 data URLs** (~33 % size inflation); `LibArray` and the per-book keys are written in **separate, unawaited `set` calls**, so `LibArray` can reference IDs whose book was never persisted; "Clear Library" calls `chrome.storage.local.clear()`, which **wipes every key in the extension's storage area** |
| `sessionStorage`       | —                      | Unused                                                                                                                                                                                                                                                                                                                            |

Two of these are correctness bugs that lose user data:

- **H6 (import race).** `Library.js:1167-1178` calls `chrome.storage.local.set`
  without awaiting the completion callback, then immediately
  `LibCreateStorageIDs` reads `"LibArray"`, appends to it, and writes it
  back. Because the two writes are independent async operations with no
  ordering guarantee, the resulting `LibArray` can reference IDs whose
  `LibEpub<ID>` was never persisted. The same pattern appears in
  `LibCreateStorageIDs` (`:297`), `LibRemoveStorageIDs` (`:309`),
  `LibFileReaderloadImportLegacy` (`:1193-1201`), and `LibSaveTextURLChange`
  (`:1209`).
- **H5 (over-broad clear).** `Library.LibClearLibrary` (`:243-253`) calls
  `chrome.storage.local.clear()`.

And one of them is why the manifest needs a permission it should not have:
`unlimitedStorage` is required because the library stores EPUBs as base64
data URLs, which inflates size and evades the per-item quota.

## Decision

We replace the storage layer with two purpose-built stores, both behind a
typed façade.

### 1. Settings and small state → `browser.storage.local`

`browser.storage.local` gives us:

- **promises**, not callbacks — no more unawaited `set` calls, which is the
  root of the import race;
- a **structured-clone** value space, so a boolean is a boolean;
- the **storage area survives page reloads** but is scoped to the extension.

Keys are **namespaced** with the extension's own prefix, and every value is
validated against a schema on read. An invalid or missing value falls back
to the declared default rather than to `false` or `undefined`.

```ts
interface Settings {
    appearance: {
        theme: "system" | "light" | "dark";
        accent: AccentName;
        density: "comfortable" | "compact";
        reduceMotion: boolean;
    };
    story: {
        filenameTemplate: string;
        language: string;
        removeAuthorNotes: boolean /* … */;
    };
    epub: { version: 2 | 3; addInformationPage: boolean /* … */ };
    images: {
        skip: boolean;
        removeDuplicates: boolean;
        compress: boolean /* … */;
    };
    behaviour: {
        skipFailedChapters: boolean;
        minDelayMs: number;
        maxChaptersPerEpub: number /* … */;
    };
    privacy: { novelUpdatesLookup: boolean; sendStoryUrl: boolean };
    advanced: { diagnostics: boolean };
}
```

The **reading list** and the **per-host parser configs** move here too,
namespaced, in the same schema-driven style. They are small, and they
belong with the other preferences — not in a separate ad-hoc store.

### 2. The library → IndexedDB

EPUBs are **binary**. Storing binary as base64 text costs ~33 % in size and
forces a decode on every read. IndexedDB stores `Blob`s natively, is
transactional, and has no blanket quota permission.

```ts
interface LibraryRecord {
    id: string; // uuid
    title: string;
    author: string;
    storyUrl: string;
    fileName: string;
    cover: Blob | null;
    epub: Blob; // the book itself, as bytes
    chapters: ChapterRef[]; // for the "new chapters" diff
    createdAt: number;
    updatedAt: number;
    newChapterCount: number;
}
```

- Two object stores: `books` (keyed by `id`) and `meta` (the ordered list of
  ids, plus the settings blob).
- **All multi-key writes are in a single transaction.** The import race
  cannot recur: the books and the id list are written atomically or not at
  all.
- **"Clear library" deletes only the library's object stores**, never the
  whole extension storage area.
- A quota-aware write path checks `navigator.storage.estimate()` before
  saving and surfaces a clear error if the disk is full — instead of silently
  failing.

### 3. Transient operation state → `sessionStorage`

The resumable-download checkpoint from
[ADR-0005](ADR-0005-background-worker.md) lives in `sessionStorage` (it
should not outlive the browser session) and is explicitly namespaced.

### 4. One façade, one migration

```ts
interface SettingsStore {
    get(): Promise<Settings>;
    set(patch: DeepPartial<Settings>): Promise<void>;
    reset(): Promise<void>;
}
interface LibraryStore {
    list(): Promise<LibraryRecord[]>;
    get(id): Promise<LibraryRecord | undefined>;
    put(rec): Promise<void>;
    delete(id): Promise<void>;
    clear(): Promise<void>;
}
```

Both stores expose **promise-based, validated** APIs. No component ever
touches `browser.storage` or `indexedDB` directly.

### Migration from the baseline

The baseline's data is not migrated automatically. The library's contents are
EPUBs the user generated with the _old_ extension; the new extension is a
separate install. A **one-time import** is offered in the options page:
"Import your library from WebToEpub", which reads the legacy
`chrome.storage.local` keys and the legacy `localStorage` keys if present and
converts them. Import is **opt-in and explicit** — we do not silently read
another extension's storage.

## Alternatives considered

| Alternative                                                   | Why rejected                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Keep everything in `localStorage`**                         | Synchronous, string-only, 5 MB quota, no binary support, and it is shared with the page's origin.                                |
| **Keep everything in `chrome.storage.local`**                 | Fixes the race (promises) but keeps the base64 bloat, which forces `unlimitedStorage`.                                           |
| **Keep base64 but drop `unlimitedStorage`**                   | `storage.local` has a 10 MB per-item quota by default; a 10 MB EPUB exceeds it. Not viable.                                      |
| **Use `browser.storage.sync`**                                | Syncs to a Mozilla account — a privacy and scope change the brief does not ask for. Rejected; see principle P7.                  |
| **Store the library as files via the File System Access API** | Requires a user-chosen directory and a permission prompt per book. Far worse ergonomics for a fire-and-forget archive. Rejected. |
| **Keep the baseline's separate stores**                       | Preserves the import race and the over-broad clear. Rejected.                                                                    |

## Consequences

**Positive**

- The import race and the over-broad clear **cannot recur** — transactions
  and a scoped delete.
- Booleans are booleans; a corrupt value falls back to a declared default.
- **`unlimitedStorage` is no longer needed**, because the library stores
  bytes, not base64.
- The library can hold far more books: IndexedDB has no 10 MB per-item
  limit and no 5 MB total limit.
- Deleting a book frees its disk space immediately.

**Negative**

- IndexedDB is asynchronous and transactional, which is more machinery than
  `localStorage`. The façade hides this from the UI.
- Existing users must import their library manually. Mitigated by the
  one-time import flow and by the fact that an EPUB the user has already
  exported to disk is unaffected.

**Neutral**

- The **preference keys change** (the schema is grouped, not flat). This is
  a documented migration note in `CHANGELOG.md`.
