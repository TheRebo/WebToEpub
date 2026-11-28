# ADR-0047 — The defaults a new user gets

- **Status:** Accepted
- **Date:** 2026-11-28
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0022](./ADR-0022-settings-enforcement.md), [ADR-0026](./ADR-0026-legacy-preferences-bridge.md), [ADR-0046](./ADR-0046-the-book-opens-on-its-cover.md)

## Context

Every default in `DEFAULT_SETTINGS` was reviewed against what it does in the
code and against the original extension's default (`legacy` branch,
`UserPreferences.js`). Most were right. Five things were not:

1. **`skipFailedChapters` was on.** A chapter that failed was silently left
   out. The book's numbering then had a gap nobody pointed out, and the
   setting's hint said the opposite of what it did ("becomes a note in the
   book"). Off, the chapter stays in its place as a note, which is what the
   hint described. The note was titled "Chapter unavailable", so the table of
   contents lost the chapter's name.
2. **`addInfoPage` was off.** The original added the page by default. It is
   the only place in the book that shows the synopsis. Its hint promised
   "the title, author, and source", and the page showed neither the title nor
   the source.
3. **`maxChapters` was 5,000.** The original allowed 10,000. A job over the
   limit is refused outright, and the longest serials run past 5,000.
4. **The legacy `removeOriginal` flag was forced off.** It has no setting.
   The original defaulted it to on, so the machine-translation parsers
   (LNMTL, Comrademao, MtledNovels, Mtlnovels) now put the untranslated
   text in every book.
5. **The defaults were copied in three more places.** The download manager
   had its own behaviour, image and book defaults, and the legacy preference
   fallback set every flag off. They had drifted from the store.

## Decision

1. `skipFailedChapters` defaults to **off**. A failed chapter is a note in
   its place, under its own title. The hint says what each choice does.
2. `addInfoPage` defaults to **on**. The page shows the title, author,
   publisher, date, source (without its query string) and synopsis.
3. `maxChapters` defaults to **10,000**.
4. `removeOriginal` defaults to **on**, as in the original.
5. The download manager's defaults and the legacy fallback are derived from
   `DEFAULT_SETTINGS`. The store is the one definition (ADR-0022).

The other defaults stay as they were: they are right. Among them: EPUB 3
(with an NCX for older readers), duplicates removed, the highest resolution
preferred, next and previous links removed, author notes and chapter numbers
kept, an empty page retried, no extra delay, diagnostics off.

## Alternatives considered

| Option                                      | Why it was rejected                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Keep skipping failed chapters, fix the hint | A book that is missing chapters without saying so is the worse failure. |
| Leave the information page off              | The synopsis would appear nowhere in the book's pages.                  |
| Add a setting for `removeOriginal`          | Four parsers use it; the original's default is what their users expect. |
| Raise `maxChapters` further, or remove it   | The limit guards memory; 10,000 is the original's tested figure.        |

## Consequences

### Positive

- A failed chapter is visible in the book and in its contents.
- Books carry their synopsis and their source.
- The machine-translation sites give a book in one language again.
- A default can no longer differ between the store and the download.

### Negative

- Users who saved settings keep them; only new installs and settings never
  saved get the new defaults.
- The book has one more page by default.

### Neutral

- The `skipFailedChapters` hint was rewritten in all five locales.
