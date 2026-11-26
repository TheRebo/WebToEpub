# ADR-0035 — An import is bounded, and the limit is the reader's business

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0034](./ADR-0034-library-import.md), [ADR-0009](./ADR-0009-testing.md), [ADR-0032](./ADR-0032-what-the-extension-may-fetch.md)

## Context

The library import (ADR-0034) reads a ZIP archive the user picked. The
reader is `zip.js`, and an archive is a thing that can lie.

Two lies matter.

The first is the obvious one: a file that is enormous. A user who picks a
two-gigabyte file should be told so before it is read into memory, not after.

The second is the one that actually bites. A ZIP entry carries a size in its
header — the archive's own claim about how big the entry is once it has been
decompressed. A crafted archive can put any number there. A classic _zip
bomb_ is an archive that claims to be small and expands to something
enormous: kilobytes on disk, gigabytes in memory.

Nothing in the original extension read a ZIP archive at all — it wrote them,
as the output. The revamp is the first code in this project to _read_ one, so
the revamp is where the question has to be answered.

There is a second-order problem, and it is the reason this ADR exists rather
than a paragraph in the code. `zip.js` does not let the caller's error
through untouched. When the stream the caller supplies throws, `zip.js`
replaces the failure with one of its own — a `TypeError` about a closed
stream, or an "invalid uncompressed size". An importer that reported a limit
by _throwing_ from its writer would therefore see its own error replaced, and
would conclude that the file was merely corrupt. The book would be skipped
and the user would never learn why.

So the limit cannot be expressed as an exception thrown from inside the
reader. It has to be recorded by the reader and reported by the importer.

## Decision

Every read in an import is bounded, and the bounds are a contract the caller
can tighten.

- The limits live in `src/core/storage/import-limits.ts`, in their own
  module, so that the page can ask how big a file may be — before reading it —
  without pulling the archive reader in with it.
- There are four limits: the size of the whole archive, the size of any one
  entry, the total size of everything decompressed in one import, and the
  number of entries the archive may list. The defaults are 256 MB for the
  archive, 64 MB per entry, 512 MB in total, and 10,000 entries.
- The page checks the chosen file's size against the archive limit **before**
  reading it into memory, and says so in the user's own language.
- The worker checks the archive's own claim about each entry _before_
  decompressing it. Refusing on a claim costs nothing; refusing after the
  fact costs the memory.
- The claim is **not believed**. The bytes are counted as they come out of
  the decompressor, and the read is abandoned the moment the count passes
  the limit. An archive that says its entry is small and is not is exactly
  the case worth catching.
- The refusal is **recorded by the writer**, not signalled by throwing. The
  importer reads the writer's record after the read and raises the limit
  error itself. This is the only way the limit survives `zip.js`'s error
  handling, and it is why the limit error is a distinct type: a limit is
  reported to the user as a refusal, while a file that cannot be read is
  skipped.
- The limit error is a `UserFacingErrorError`, so the sentence survives the
  trip across the message bus to the page. A plain exception would arrive as
  "Could not reach the site", which would send the user looking in entirely
  the wrong place.

## Alternatives considered

| Option                                      | Why it was rejected                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trust the archive's own size                | This is the zip bomb. The header is attacker-controlled data.                                                                                                         |
| Cap the total only                          | One entry of 64 MB is fine; ten thousand of them is 640 MB. The per-entry and total limits are both needed.                                                           |
| Throw the limit error from the writer       | `zip.js` replaces it with its own error, and the limit becomes indistinguishable from a corrupt file. The limit has to be recorded.                                   |
| Give the import unlimited memory            | A user who picks the wrong file loses the tab, and a crafted archive can do it deliberately.                                                                          |
| Let the browser's own protections handle it | There are none that help here. The browser will happily allocate the memory the archive asks for.                                                                     |
| Make the limits a user setting              | A limit the user can raise is a limit that will be raised, and the setting would be one more thing to explain. The defaults are generous enough for any real library. |
| Cap only in the page, not in the worker     | The page's check is a courtesy. The bytes are read in the worker, so that is where the limit has to be enforced.                                                      |

## Consequences

### Positive

- A zip bomb is refused, and the refusal names the reason.
- The user learns _why_ an import failed, instead of seeing an empty result.
- The limits are testable on their own: each one has a test that fails when
  the limit is removed.
- The page can refuse an oversized file without reading it.

### Negative

- A library larger than 256 MB cannot be imported. The limit is generous
  enough that this should not happen in practice, but it is a hard ceiling.
- The writer has to keep a record of the bytes it has seen, and the importer
  has to ask for it after the read. That is more machinery than a plain
  `throw`.

### Neutral

- The limits are a parameter of `parseLibraryExport`, so a caller can tighten
  them for a test or a future "read from a disk" import without changing the
  reader.
- The limit error carries the `UNSUPPORTED` code, which reads correctly in a
  log and in the diagnostics panel.
