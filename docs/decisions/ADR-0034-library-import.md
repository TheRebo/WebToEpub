# ADR-0034 — The old library comes in through a file, not through storage

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0019](./ADR-0019-library-shelf.md), [ADR-0007](./ADR-0007-permissions.md)

## Context

The original extension kept a library: the books the user had made, with
their covers, in `chrome.storage.local` under keys like `LibEpub0`,
`LibStoryURL0` and `LibCover0`. A user who had made two hundred books had
two hundred books in there, and there was no way to get them out except the
extension's own export button, which produced a ZIP archive.

Kintsugi's library is IndexedDB, keyed by a UUID, holding a book's metadata
and its cover — not the book itself. The two do not share a storage area, and
they cannot: `storage.local` and IndexedDB are both scoped to the **extension
ID**.

And the IDs are not the same. The original is `WebToEpub@Baka-tsuki.org`;
Kintsugi is `kintsugi@localhost` in development and would be whatever an AMO
submission is given in production. Two different IDs are two different
storages, and the original's storage is unreadable from Kintsugi.

So the library does not carry over by itself. The question is what to do
about it.

## Decision

We will import the old library from a file the user exports from the old
extension.

- The original's export format is read directly. It is a ZIP archive with a
  written-down shape: `LibraryVersion.txt`, `LibraryCountEntries.txt`, and
  a `Library/<i>/` directory per book holding `LibEpub`, `LibFilename`,
  `LibStoryURL`, `LibCover` and `LibNewChapterCount`. The importer reads
  that shape, and refuses an archive whose `LibraryVersion.txt` says a
  version it does not know.
- The import button is on the **Library** panel of the options page, next to
  the books. The user exports from the old extension, picks the file here,
  and the books appear.
- What comes across is the **library**: each book's title, author, chapter
  count, cover and the address of the story it came from. The books
  themselves are not copied — they are files on the user's disk, and
  Kintsugi's library has never held a book, only the record of one.
- A book that is already in the library is **updated**, not duplicated. The
  same story is one book, however many times it was made.
- A book that cannot be read is **skipped**, not fatal. One corrupt book in a
  hundred should not cost the user the other ninety-nine.
- A book with no story address is **not added**. Without one it cannot be
  told apart from another, and the library would fill with entries the user
  could only remove by hand.
- The file is read in the options page and handed to the worker as an
  `ArrayBuffer` — as bytes, not as a string of base64. The page does no
  parsing of its own: it hands over a file and reports what came back.

## Alternatives considered

| Option                                               | Why it was rejected                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the original's extension ID                     | The ID belongs to the original's author, and taking it would collide with the original if both were installed. It is also the wrong shape for a rewrite with a different name.     |
| Read the original's `storage.local` directly         | It is in a different extension's storage. There is no API for it.                                                                                                                  |
| Use the `management` API to read the other extension | It requires the `management` permission, which lets an extension read and control every other extension. That is a far larger grant than reading a file the user hands over.       |
| Migrate the settings the same way                    | Settings are the user's preferences, and there are few of them; the library is two hundred books, and the export is the only sane way to move them.                                |
| Import the books themselves, not the records         | The books are megabytes each, and the original's copies are the user's files already. Copying them would double the user's disk use for no gain.                                   |
| Merge the original's EPUB with the new one           | The original could merge a new book into an old one, because it held both. Kintsugi does not hold the old book, so there is nothing to merge with. A book is imported as a record. |
| Say nothing and let the library start empty          | The user would find their books gone, with no explanation and no way to get them back.                                                                                             |

## Consequences

### Positive

- The user who had two hundred books keeps them, as records, and can find
  them again.
- The import needs no permission beyond what the extension already has: the
  user hands the file over.
- An export from a future version of the original is refused with a clear
  message rather than half-applied.

### Negative

- It is a manual step. The user has to export from the old extension and
  import here.
- An imported book cannot be updated chapter by chapter, because the original
  did not record the chapters' addresses in its export. The book's own file
  is still on the user's disk, and a fresh download produces a new, complete
  record.
- The original's _reading list_ — the stories the user was following, with
  the last chapter they had read — is not imported. It is a list of URLs, and
  Kintsugi's reading list is a separate feature that was not built.

### Neutral

- The importer is small and reads a format that is not going to change: the
  original is finished.
