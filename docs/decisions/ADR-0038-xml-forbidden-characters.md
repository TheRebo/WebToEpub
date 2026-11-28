# ADR-0038 — The characters XML forbids never reach the book

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0008](./ADR-0008-epub-pipeline.md), [ADR-0025](./ADR-0025-chapters-are-written-as-xml.md), [ADR-0031](./ADR-0031-epub-specification-conformance.md)

## Context

A chapter is written into the book as XHTML, which is XML. XML 1.0 is strict
about the characters a document may contain:

> `[9] | [10] | [13] | [20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`

The tab, the line feed and the carriage return are allowed. Everything else
below U+0020 — the null byte, the vertical tab, the form feed, the other
control characters — is forbidden, and so is the surrogate range and U+FFFE
and U+FFFF. A forbidden character cannot appear in a document at all, not even
as a numeric character reference, so there is no way to write one.

The sanitiser kept them. DOMPurify preserves control characters in the text it
returns, and the extension's own sanitiser only filtered tags, attributes and
dangerous URLs — so a site's markup could put a vertical tab into a chapter,
and it reached the book unchanged.

The consequence is worse than a broken chapter. A document carrying a
forbidden character is not well-formed XML, and a reader that checks refuses
the **whole book** — every chapter, not the one that was damaged. One
control character in one chapter loses the reader's copy of the entire story.

The HTML parser hides the problem in testing: parsing a document with a
control character in it strips the character, so a test that parses the
chapter's markup and reads it back sees a clean paragraph. The character only
survives when it goes through the _sanitiser_ as a string, which is the path
the download manager actually takes.

## Decision

The forbidden characters are removed before anything else happens, at two
places.

- The sanitiser removes them from the HTML it returns, so they never enter
  the extension's own data structures.
- The XML serialiser removes them from every text node, every attribute value
  and every CDATA payload it writes, so they cannot reach the book by any
  route — including the routes that do not go through the sanitiser.

They are removed rather than escaped, because XML has nothing to escape them
to.

The rule lives in one module, `util/xml-characters.ts`, so that the two places
cannot drift apart.

## Alternatives considered

| Option                              | Why it was rejected                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escape them as character references | XML forbids them in the document _and_ in character references. There is no way to write one.                                                                                                         |
| Replace them with a space           | A form feed or a vertical tab in a chapter is usually layout, and a space is the closest thing to it. But the null byte is not layout, and the reader would show a space where the text said nothing. |
| Leave them and let the reader cope  | A reader that checks refuses the whole book, not the chapter.                                                                                                                                         |
| Strip them in the HTML parser       | The parser already strips some of them — which is why the tests missed this. The parser is not the extension's to change, and the path that matters does not go through it.                           |
| Strip them only in the serialiser   | The serialiser is the last line of defence, and it is the right one, but the characters would still sit in the extension's own data — and the serialiser is not the only writer of XML.               |

## Consequences

### Positive

- A book is never invalid because of a control character in a chapter.
- The characters never enter the extension's own data, so they cannot appear
  in the UI either.

### Negative

- A chapter that used a form feed for layout loses it. Nothing readable is
  lost: those characters are not shown by any reader.
- The tab, the line feed and the carriage return are kept, because XML allows
  them and a chapter that uses them for indentation needs them.

### Neutral

- The cost is one regular-expression pass over the chapter's text, in a place
  that is already rewriting the text.
