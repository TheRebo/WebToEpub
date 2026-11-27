# ADR-0044 — A namespace declaration is part of the element

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0025](./ADR-0025-chapters-are-written-as-xml.md), [ADR-0031](./ADR-0031-epub-specification-conformance.md)

## Context

A chapter is written into the book as XHTML, which is XML. The serialiser
that turns the HTML into XML skipped every namespace declaration it found,
on the grounds that the chapter's root element declares them already.

That is true for one namespace and one only: XHTML itself. Every other
namespace the root does _not_ declare was being thrown away with it.

The consequence is silent. An `<svg>` inside a chapter carries
`xmlns="http://www.w3.org/2000/svg"`. Without the declaration, the element
is in the XHTML namespace, where `<svg>` means nothing — the reader shows a
blank space where the picture was, and nothing anywhere says why. The same
goes for `xmlns:xlink`, which an SVG's `<use>` needs for its `xlink:href`.

The chapter's content is sanitised before it is serialised, and the
sanitiser's allow-list does not include `svg` or any namespaced attribute,
so this cannot be reached through the normal path today. But
`serializeAsXml` is a public helper, and a public helper that can produce
a document that is not well-formed XML is a trap for whoever calls it
next.

## Decision

A namespace declaration is kept, except for the one the chapter's own root
already declares.

The XHTML namespace is the exception, because the root writes it and
repeating it would say nothing new. Everything else — the SVG namespace, a
prefixed namespace, a namespace a site invented for itself — is part of the
element and stays with it.

Keeping a prefixed declaration is also the right answer for a book in the
older format, whose root does not declare the `epub` prefix: the inner
declaration is what makes the prefix valid, so the document stays well
formed either way.

## Alternatives considered

| Option                                      | Why it was rejected                                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip every namespace declaration, as before | The bug. The element loses the meaning that makes it an element.                                                                                                                                                     |
| Skip only the XHTML namespace               | The same as the decision. It is listed because it is the alternative that looks like a special case but is the rule.                                                                                                 |
| Add `svg` to the sanitiser's allow-list     | A separate, larger question. Allowing SVG means allowing its elements and its attributes, `xlink:href` among them — a known injection vector. The extension packs SVG _files_ as images, which is a different thing. |
| Write every namespace on the chapter's root | The root is written by the writer, which does not read the chapters. It could not know which namespaces a given chapter needs.                                                                                       |

## Consequences

### Positive

- The public serialiser cannot produce a document that is not well-formed
  XML because of a missing namespace.
- An SVG inside a chapter keeps its meaning, if one ever gets that far.

### Negative

- A chapter whose content repeats the XHTML namespace on an inner element
  no longer has that repetition removed. It is valid XML and the reader
  does not care.

### Neutral

- One comparison per attribute, in a loop that was already there.
