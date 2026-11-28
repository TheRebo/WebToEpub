# ADR-0025 — A chapter is written as XML, not as HTML

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0008](./ADR-0008-epub-pipeline.md), [ADR-0031](./ADR-0031-epub-specification-conformance.md)

## Context

A chapter arrives as HTML. It goes into the book as XHTML, which is XML.
Those are not the same language, and the differences are not cosmetic:

- XML has no void elements. `<br>` is `<br/>`; `<img>` is `<img/>`; `<hr>`
  is `<hr/>`. HTML's serialiser will not close them.
- Every attribute's value must be quoted and escaped. `<a href=a&b>` is not
  XML.
- The characters XML reserves — `&`, `<`, `>` — must be escaped as entities,
  even inside text.
- An element that is never closed makes the _whole document_ ill-formed, and
  an ill-formed document is not a chapter: it is a broken book.

The original serialised chapters with the HTML serialiser and hoped the
result happened to be acceptable XML. It mostly was, on the sites it had been
tuned against, and it was not on the others. A chapter with a `<br>` in it —
which is nearly every chapter — produced a file that a strict reader
refused, and the refusal took the whole book with it.

## Decision

We will write chapters with an XML serialiser, and we will build it on the
parsed document rather than on the text.

- The content is parsed into a document first. The serialiser then walks the
  _tree_, so it cannot be fooled by the shape of the content: a `<br>` inside
  an attribute, a `>` inside a script, an unbalanced tag in the source.
- Void elements are closed. Every attribute's value is quoted and escaped.
  The reserved characters are escaped in text and in attribute values alike.
- The result is well-formed XML by construction, not by luck.
- The serialiser is one module (`epub/xhtml.ts`) with one job, so the rule is
  applied identically to every chapter of every book.

The EPUB validator is the arbiter: a book that does not validate is not
finished. See [ADR-0031](./ADR-0031-epub-specification-conformance.md).

## Alternatives considered

| Option                                | Why it was rejected                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use the HTML serialiser and hope      | It is the bug. HTML's serialiser does not close void elements, so the output is not well-formed XML.                                                                                |
| Use `XMLSerializer`                   | It is the right idea and the wrong tool: it serialises a DOM that the browser has already parsed as HTML, and the HTML parser has already normalised the document in HTML's favour. |
| Regex-replace void elements           | It is a text operation on a tree, and it gets confused by the first `<br>` that appears inside an attribute value.                                                                  |
| Store chapters as HTML in the book    | EPUB 3 requires XHTML content documents. A book full of HTML files is not an EPUB, however it is dressed up.                                                                        |
| Validate the output and keep the HTML | Then the check fails and the chapter is dropped anyway, with less information than a correct serialiser would have given.                                                           |

## Consequences

### Positive

- A chapter with a line break, an ampersand in a URL, or an unclosed tag is
  still a valid document.
- The books validate: the reference validator reports zero errors and zero
  warnings on the books the build produces.
- The serialiser works on the tree, so the content's shape cannot break it.

### Negative

- The serialiser has to know which elements are void. The list is HTML's and
  is fixed; a new element would need adding. The list is checked against the
  HTML specification's list in a test.
- Serialising the tree normalises some of the source's quirks — attribute
  order, quoting, whitespace in the markup. The rendered result is the same.

### Neutral

- The output is not byte-for-byte what the site sent, and was never going to
  be: the chapter is sanitised before it is serialised.
