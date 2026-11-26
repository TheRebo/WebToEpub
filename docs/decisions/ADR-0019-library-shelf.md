# ADR-0019 — The library is a shelf, not a note

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0018](./ADR-0018-message-boundary.md)

## Context

The extension's last act is to produce a file. In the original that was the
end of the story: the EPUB was offered to the browser's download machinery and
the extension forgot about it. The user who made forty books had no way to see
them, to find the one from last week, or to know which site a given book came
from.

That is a real gap, but it is a gap with a cost. A library means keeping
something. Every book is bytes the extension holds on the user's disk, and a
library that grows without the user knowing what it holds is a privacy
liability rather than a convenience.

So the library has two halves, and they have to be designed together:

1. A place the books are kept, and
2. A way for the user to see what is there — and to empty it.

## Decision

We will keep a library of the books the user has made, and we will show it to
them plainly.

- A finished book is written into the library as it is saved, together with
  the metadata that identifies it: title, author, the story's address, the
  chapter count, the size, and the moment it was added.
- The book's bytes go into IndexedDB, not into `browser.storage`. The
  reasons are in [ADR-0006](./ADR-0006-storage.md); the short version is that
  base64 in `storage.local` inflated every file by a third and needed the
  `unlimitedStorage` permission to survive at all.
- The worker answers `library:list` with the metadata **only**. The bytes are
  never copied across the message boundary to draw a grid: a cover can be a
  hundred kilobytes, and there is no reason to move a hundred kilobytes per
  book to draw a placeholder.
- The library is listed in the options page, as a grid of covers with their
  titles and their chapter counts, and each book can be removed from there.
- Removing a book deletes its bytes. There is no soft delete and no trash.

## Alternatives considered

| Option                                    | Why it was rejected                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No library at all                         | The user cannot find last week's book, and cannot tell the extension to stop keeping it. A feature that cannot be emptied is a feature nobody should ship.   |
| Keep the bytes in `browser.storage.local` | Base64 inflates by a third, the per-item quota is 10 MB, and surviving it needs `unlimitedStorage` — a permission bought by an implementation choice.        |
| Send the bytes to the options page        | A cover is up to a hundred kilobytes. Copying every book's bytes to draw a grid is copying bytes for nothing.                                                |
| Keep a "recent downloads" list only       | A list is not a shelf. The user asked for a book they made a month ago; a list of five recent things does not answer that.                                   |
| Soft delete, with a trash bin             | The library is the extension's only long-lived copy of the user's data. A second, hidden copy of it would be exactly the sort of retention nobody asked for. |
| Cloud sync                                | It is a different product: a server, an account, a privacy policy, and a set of legal obligations that a book-making extension has no business acquiring.    |

## Consequences

### Positive

- The user can find a book they made, and can see what the extension is
  keeping.
- Deleting a book really deletes it, so the library's size is the user's
  choice and is visible.
- The permission set stays smaller: `unlimitedStorage` is not needed, because
  IndexedDB has no blanket quota to escape from.

### Negative

- The extension now holds user data on disk, which it did not before. The
  privacy note in `PRIVACY.md` says so plainly, and the library can be
  emptied from the options page.
- A book that is saved but not added to the library would be a confusing
  half-state, so "saved" and "in the library" are the same event.

### Neutral

- The library is local. There is no account and nothing to sync, which also
  means nothing to lose to a server outage.
