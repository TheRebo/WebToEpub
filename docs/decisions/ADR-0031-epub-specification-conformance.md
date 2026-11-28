# ADR-0031 — Conform to the EPUB specification, and check it with the reference validator

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0008](./ADR-0008-epub-pipeline.md), [ADR-0015](./ADR-0015-epub-container.md), [ADR-0016](./ADR-0016-package-images.md), [ADR-0017](./ADR-0017-zip-without-a-worker.md)

## Context

The rewrite rebuilt the EPUB pipeline on a real document model rather than on
regular expressions, which was the right structural decision. But it wrote the
documents against _our_ idea of the EPUB specification rather than against
the specification itself.

The audit found this by running the official validator, EPUBCheck 5.1.0, over
a book the packer actually produces. The result was not a book that was
slightly wrong. **Both versions were invalid**:

The EPUB 3 book reported two errors:

| Error                                                        | Cause                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `OPF-001: There was an error when parsing the EPUB version`  | The package element wrote `version="3"`. The specification writes `3.0`.                                       |
| `PKG-005: The mimetype file has an extra field of length 45` | `zip.js` wrote an extended-timestamp extra field into the `mimetype` entry. The OCF specification forbids one. |

The EPUB 2 book reported **eight** errors and a warning:

| Error                                                             | Cause                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `attribute "opf:role" not allowed here`                           | `opf:role` is EPUB 2's way of giving a creator its role. EPUB 3 forbids the attribute and wants a refinement. |
| `package dcterms:modified meta element must occur exactly once`   | EPUB 3 requires the element; the writer never emitted it.                                                     |
| `spine element toc attribute must be set when an NCX is included` | The spine never named the NCX.                                                                                |
| `attribute "xml:lang" not allowed here` (× 3 files)               | EPUB 2's package element has no `xml:lang` attribute.                                                         |
| `attribute "properties" not allowed here`                         | `properties` is an EPUB 3 addition; EPUB 2's schema has no such attribute.                                    |
| `Irregular DOCTYPE` (× 3 files)                                   | EPUB 2 wants the XHTML 1.1 public doctype, not `<!DOCTYPE html>`.                                             |
| `attribute "charset" not allowed here` (× 3 files)                | `<meta charset>` is HTML5; XHTML 1.1 wants an `http-equiv` element.                                           |
| `NAV-011: "toc" nav must be in reading order`                     | The information page was first in the table of contents and _last_ in the spine.                              |

Every one of these is a real defect with a real user-visible consequence: a
book that a validating reader refuses, or a table of contents whose links do
not match the order the pages are in.

The root cause is the same in every case: **we wrote the documents from memory
instead of from the specification, and we never checked.** Our own tests
asserted that the book was internally _consistent_ — that the manifest
matched the spine, that the navigation document matched the chapters — and
internal consistency is not the same thing as validity. A book can be
perfectly self-consistent and still be rejected.

## Decision

We will write the EPUB against the specification, and we will check it with
the reference validator.

- The two versions are written differently where the specification says they
  differ. The writer asks which version it is writing for, and produces the
  dialect that version wants: the creator's role, the modification date, the
  `properties` attribute, the package element's language, and the XHTML
  dialect — HTML5 for EPUB 3, XHTML 1.1 for EPUB 2.
- The version is written the way the specification writes it: `3.0` and
  `2.0`. The reader accepts both that and the bare form, so a book produced
  by an older version of the extension is still read correctly.
- The `mimetype` entry carries no extra field. `zip.js` writes one by
  default, so the extended timestamp is switched off for that entry.
- The information page is first in the spine as well as in the table of
  contents. The navigation document's links have to be in reading order.
- The specification's rules that are cheap to check are checked by the test
  suite, in `tests/unit/epub-spec.test.ts`. The reference validator is not
  part of the ordinary test run — it needs a JVM and a 30 MB download — but
  `tools/build-sample-epub.mjs` builds a book that can be fed to it, and
  `tools/dump-zip.mjs` shows the archive's bytes.
- The same rules are enforced by hand once, and the result recorded: **both
  versions now validate with zero errors and zero warnings.**

## Alternatives considered

| Option                                                          | Why it was rejected                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship EPUB 3 only, and drop EPUB 2                               | The EPUB version is a user-facing setting, and EPUB 2 is what older readers need. Dropping a setting the UI offers is worse than fixing it.                                           |
| Add EPUBCheck to the test suite                                 | It needs a JVM and a 30 MB download on every machine that runs the tests, and on every CI run. The rules it enforces that we can check cheaply are checked in the unit tests instead. |
| Validate only in CI                                             | CI catches the regression, but the developer who wrote the code cannot. A validator that only runs on a server is a validator most changes never meet.                                |
| Write the documents from the specification and trust the memory | This is what produced eleven errors. The specification is long and the details are exactly the kind that are forgotten.                                                               |
| Keep one XHTML dialect for both versions                        | The dialects are not interchangeable. EPUB 2's validator rejects the HTML5 doctype and the `charset` attribute outright.                                                              |

## Consequences

### Positive

- The extension's output is a valid EPUB. Both versions pass the reference
  validator with no errors and no warnings, where the EPUB 2 book previously
  failed on eight counts.
- A reader that validates its input now accepts the book, rather than
  refusing it with a message about an unknown attribute.
- The table of contents matches the order the pages are in.
- The rules are now expressed as tests, so a future change that breaks one
  fails the build rather than the reader.

### Negative

- The writer is version-aware, which is more code than a single dialect. The
  EPUB 2 path is a minority of the output, but it is a path the settings
  offer, so it has to be correct.
- The `zip.js` configuration now differs per entry, which is one more thing
  to know about the archiver.
- The validator itself is not part of the ordinary test run. The unit tests
  cover the rules we thought of; a rule we did not think of is still caught
  only when someone runs the validator by hand.

### Neutral

- The information page now comes first in the book. It was always first in
  the table of contents, so this makes the two agree.
- The `dcterms:modified` element records when the book was generated. It is
  not the story's publication date, and it is not the date the book was last
  downloaded.
