# ADR-0046 — The book opens on its cover, and the author is named once

- **Status:** Accepted
- **Date:** 2026-11-28
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0044](./ADR-0044-a-namespace-declaration-is-part-of-the-element.md)

## Context

A book built from Novel Phoenix (38 chapters) was checked by hand. Three
things in it were not what a reader expects:

1. Every chapter began with `<p class="chapter-author">` naming the author,
   above the chapter's heading. The stylesheet had no rule for the class, so
   it rendered as an indented body paragraph, 38 times. The original
   extension never did this, and no decision asked for it.
2. The cover was only flagged in the manifest (`properties="cover-image"`
   and `<meta name="cover">`). Calibre, KOReader and Apple Books show that.
   Readers that show the first page of the spine as the cover, and the
   Kindle conversion, showed no cover at all. The original extension wrote
   a cover page.
3. In the package document, `<dc:creator>` and the next element shared a
   line. Readers do not care, but anyone reading the file does.

## Decision

1. **The author is named once**, in the book's metadata (and on the
   information page, when the user asks for it). Chapters carry no byline.
2. **A book with a cover opens on a cover page.** `text/cover.xhtml` holds
   the cover image, first in the spine, ahead of the information page. It is
   not in the table of contents: it is a picture, not a section. A book
   without a cover has no cover page.
3. **Each creator is on its own line**, indented like its neighbours, in
   both EPUB 2 and EPUB 3.

None of these gets a setting. The first and second restore what the
original extension did; the third changes no behaviour.

## Alternatives considered

| Option                                      | Why it was rejected                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Style the byline instead of removing it     | It is still the same line in every chapter, and no reader asked for it.            |
| Make the byline a setting, off by default   | A setting for something nobody asked for; the information page already names them. |
| Put the cover page in the table of contents | A contents entry for a picture; the reader already opens on it.                    |
| Leave the cover to the manifest flag alone  | Some readers and the Kindle conversion then show no cover.                         |

## Consequences

### Positive

- Chapters start with their heading, as in the original extension.
- The cover shows in every reader, including the Kindle conversion.

### Negative

- The spine has one more item than there are chapters (two with the
  information page). Code that counts chapters from the spine must not.

### Neutral

- The book is a few hundred bytes larger.
