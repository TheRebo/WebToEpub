# ADR-0017 — Build the ZIP in the worker, without a web worker

- **Status:** Accepted
- **Date:** 2025-11-25
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0005](./ADR-0005-background-worker.md), [ADR-0012](./ADR-0012-lazy-zip.md), [ADR-0015](./ADR-0015-epub-container.md)

## Context

`zip.js` can compress in two ways: with the platform's `CompressionStream`,
or with its own WebAssembly codec. It also offers to do the work in a _web
worker_, so a large archive does not block the thread that starts it.

Two problems appeared when Kintsugi tried both.

**The worker hung.** The extension's content security policy is
`script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'`.
The extension loads its background code as an MV3 `background.scripts` entry,
which Firefox runs as an event page — a full DOM, but a document whose CSP
applies to everything it creates. When `zip.js` tried to spawn a worker from a
blob URL, the CSP blocked it, and the promise `zip()` returned never settled.
The download sat in the "saving" phase for ever. The user saw a progress bar
that stopped moving and no file.

**The WebAssembly codec was blocked.** When `zip.js` is told to store an entry
without compressing it, it sets `useCompressionStream` to `false` and falls
back to its WebAssembly implementation of zlib. The extension's CSP does not
include `wasm-unsafe-eval`, so `WebAssembly.instantiate()` was refused with
`CompileError: call to WebAssembly.instantiate() blocked by CSP`. The job
failed with a message about not being able to reach the site, which pointed
the user at entirely the wrong problem.

## Decision

We will configure `zip.js` with `useWebWorkers: false`, and we will set the
compression **method** rather than the compression **level**.

- `useWebWorkers: false` keeps the compression on the thread that asked for
  it. There is no worker to block, and the promise always settles.
- `{ compressionMethod: 0, dataDescriptor: false }` stores the `mimetype`
  entry uncompressed and writes its size and CRC into the local file header.
  Setting `level: 0` would also store the entry, but it turns off
  `useCompressionStream` and so reaches for the blocked WebAssembly codec.
- `passThrough` is not used: it stores the entry but skips the CRC-32
  calculation, so the entry gets a CRC of zero and readers report a bad CRC.

`configure()` is called immediately after the dynamic import, so it applies to
every writer the extension creates.

## Alternatives considered

| Option                                 | Why it was rejected                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Leave the web worker on                | The CSP blocks the worker; the save hangs for ever                             |
| Add `wasm-unsafe-eval` to the CSP      | A real permission for the extension's users, taken on for one parser's benefit |
| Write the ZIP by hand                  | The container format is fiddly, and `zip.js` is already a dependency           |
| Use `level: 0` for the stored entry    | It reaches for the WebAssembly codec, which the CSP blocks                     |
| Use `passThrough` for the stored entry | It skips the CRC, so the entry reads as corrupt                                |

## Consequences

### Positive

- The save always completes, and the failure, when there is one, is a real
  error rather than a hang.
- The container is valid: the `mimetype` entry is first, stored, and carries
  a correct CRC.
- No extra permission is asked of the user.

### Negative

- Compressing a large book blocks the worker thread. The worker's progress
  reports are driven by the download, not the compression, so the last phase
  is a pause rather than a moving bar.
- The extension's CSP stays strict, which is where it should be.

### Neutral

- The archive is still compressed; only the `mimetype` entry is stored.
