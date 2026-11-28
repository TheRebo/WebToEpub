# ADR-0015 — Build the EPUB container ourselves, and store the `mimetype` entry

- **Status:** Accepted
- **Date:** 2025-11-25
- **Relates to:** [ADR-0008](ADR-0008-epub-pipeline.md), [ADR-0012](ADR-0012-lazy-zip.md)

---

## Context

The audit of round one turned up a defect that no test caught and that no
reader had complained about: **the generated EPUB had no `mimetype` entry at
all.**

The EPUB OCF specification is unambiguous about this file. Every container
carries a `mimetype` file at its root, holding the literal text
`application/epub+zip`. It must be:

- the **first** entry in the archive, so a reader can identify the format
  without unpacking anything;
- **stored** (compression method 0), not deflated, so that the text sits
  literally in the first few dozen bytes of the file.

A container without it is not a valid EPUB. Some readers open it anyway;
others refuse it. `epubcheck` rejects it outright.

The baseline had the same defect — its packer wrote `mimetype` only for some
output paths — so this is an inherited bug, not one the rewrite introduced.
The rewrite reproduced it because the requirement was not written down
anywhere, and the packer's own tests only asserted on the files the packer
_chose_ to produce. A test that checks "the files I made are present" cannot
catch "the file I did not make is missing".

### The second-order problem

Fixing it is not as simple as adding a file to the list. `zip.js` has three
different ways to store an entry, and two of them are traps.

**Trap one: `level: 0`.** The obvious way to ask for a stored entry is to set
the compression level to zero. In `zip.js`, setting `level` to anything other
than the default 6 turns `useCompressionStream` off:

```js
// zip.js/lib/core/zip-writer.js
if (level !== UNDEFINED_VALUE && level != 6) {
    useCompressionStream = false;
}
```

With the native compression stream off, `zip.js` falls back to its
**WebAssembly** zlib codec:

```js
// zip.js/lib/core/codec-worker.js
if (!options.useCompressionStream && !initializedModule) {
    await initModule(wasmURI, config); // WebAssembly.instantiate(...)
}
```

The extension's content security policy is `script-src 'self'; object-src
'none'; base-uri 'none'; frame-src 'none'` — there is no `wasm-unsafe-eval`,
and there should not be. The archive therefore fails with:

```
CompileError: call to WebAssembly.instantiate() blocked by CSP
```

and the download job reports "Could not reach the site", because the error is
a `TypeError` from the platform and never carries a status.

**Trap two: `passThrough: true`.** The second way to store an entry is to
write its data as-is. `zip.js` supports this, but it sets `signed: false`,
which skips the CRC-32 computation entirely. The entry ends up with a CRC of
zero in its header, and strict readers report a checksum mismatch.

**Trap three: the data descriptor.** By default `zip.js` writes the entry's
size and checksum _after_ the data, in a data descriptor, and leaves the
local header's copy zeroed. The OCF specification wants the size and
checksum in the local header, where a reader finds them without reading the
data first.

## Decision

We write the archive ourselves, in `src/core/epub/archiver.ts`, and we set
the compression **method** rather than the compression **level**.

```ts
const options = stored
    ? { compressionMethod: 0, dataDescriptor: false }
    : undefined;
await writer.add(file.path, new Uint8ArrayReader(bytes), options);
```

This combination gives:

| Requirement                | How it is met                                                                |
| -------------------------- | ---------------------------------------------------------------------------- |
| Stored, not deflated       | `compressionMethod: 0`                                                       |
| Not the WASM path          | `level` is left unset, so `useCompressionStream` stays on                    |
| Correct CRC-32             | The entry is signed, because `passThrough` is not used                       |
| Size and CRC in the header | `dataDescriptor: false`                                                      |
| First entry in the archive | The packer puts `mimetype` first, and the archiver writes the files in order |

The archiver is a separate module rather than a private method of the
download manager, because "how the container is built" is a property of the
EPUB format, not of the download flow — and because it lets the archive's
structure be asserted directly in a unit test, which is the only way the
defect that started this could have been caught.

### The test that would have caught it

`tests/unit/archiver.test.ts` parses the archive's **central directory**
directly and asserts the entry's name, order, compression method, sizes and
checksum. It does not use `zip.js` to read the archive back, because reading
it back with the same library that wrote it would accept whatever the writer
produced. The test reads the bytes as a ZIP, the way a reader would.

## Alternatives considered

| Alternative                                               | Why rejected                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Set `level: 0`**                                        | Turns off the native compression stream and sends the entry through the WebAssembly codec, which the content security policy blocks. The archive never completes.         |
| **Use `passThrough: true`**                               | Skips the CRC-32 computation, leaving the entry with a checksum of zero. Strict readers report a checksum mismatch.                                                       |
| **Add `wasm-unsafe-eval` to the content security policy** | It would work, but it weakens the policy for the whole extension to accommodate one library's fallback path. The policy is deliberately strict (ADR-0007).                |
| **Write the ZIP container by hand**                       | A ZIP with deflate, CRC-32, data descriptors and ZIP64 is not a small format, and it is exactly the kind of security-sensitive parsing the baseline got wrong (ADR-0008). |
| **Let `zip.js` handle the `mimetype` entry implicitly**   | `zip.js` does not know about OCF. The requirement has to be stated somewhere, and the archiver is the place.                                                              |
| **Assert the archive by reading it back with `zip.js`**   | A round trip through the writer proves only that the writer agrees with itself. The defect this ADR exists to fix was invisible to exactly that kind of test.             |

## Consequences

### Positive

- The generated books are valid EPUBs, and pass `epubcheck`'s container
  checks.
- The archive's structure is asserted by a test that reads the bytes the way
  a reader does, so the next change to the packer cannot silently drop the
  `mimetype` entry again.
- The archive's construction is separated from the download flow, so the
  format's rules live in one file.

### Negative

- The archiver depends on `zip.js` behaving in a particular way around
  `compressionMethod`, `level` and `dataDescriptor`. That behaviour is
  documented in `zip.js`, but it is not part of a stable public contract, and
  an upgrade could change it. The unit test is the mitigation: it would fail
  loudly rather than silently produce a broken book.
- The archive's bytes are built up front rather than streamed, so a very
  large book briefly holds both its files and its archive in memory. For the
  books this extension produces — a few megabytes — this is not a concern.

### Neutral

- The `mimetype` file is a member of the container's file list, so the
  packer's `collectFiles` no longer has to special-case it.
- The reader is unchanged: it finds `META-INF/container.xml` and ignores
  everything else, so it reads archives with or without a `mimetype` entry.
