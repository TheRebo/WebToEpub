# ADR-0043 — A blocked database is a wait, not a failure

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0019](./ADR-0019-library-shelf.md)

## Context

The library lives in IndexedDB. When the schema has to change, the browser
blocks the open until every other connection to that database has let go of
it. It fires a `blocked` event, and the open request then _stays pending_:
it succeeds as soon as the other connection closes.

The store rejected the promise the moment the open was blocked. Three
things followed from that:

- **A wait became a hard failure.** The user who had the library open in two
  tabs got an error instead of a library. The browser was going to give them
  the library as soon as they closed the other tab; the extension took that
  answer away from them.
- **The request was abandoned.** The open request stayed pending after the
  rejection. When the blocking connection eventually closed, the request
  succeeded — and its database handle was live, and nobody was ever going to
  close it. A leaked connection blocks the _next_ schema change, so the leak
  was not a slow one; it broke the library's next upgrade.
- **The close raised an unhandled rejection.** `close()` waited for the open
  and then closed the database. If the open failed, the promise the close was
  waiting on rejected, and the close's own promise had no handler — so the
  failure surfaced in the worker as an unhandled rejection the user did
  nothing to cause.

## Decision

A blocked open is a wait, and the store waits.

- `openLibraryDatabase` no longer rejects on `blocked`. It reports the
  condition through an optional callback and leaves the request pending, so
  it succeeds when the other connection lets go.
- The store passes a callback that records the wait in the diagnostics log,
  so the condition is visible without being an error.
- `close()` handles the failure of the open it is waiting on. There is no
  database to close when the open failed, and the failure has already been
  reported to whoever asked for the data — the close must not raise it a
  second time.

## Alternatives considered

| Option                                                      | Why it was rejected                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Reject on `blocked`, as before                              | The bug. A wait the browser would have resolved became an error, and the abandoned request leaked a connection.                              |
| Reject on `blocked`, and close the handle if it later opens | It fixes the leak but keeps the wrong behaviour: the user still gets an error where the browser would have waited.                           |
| Give up on the library when it is blocked                   | The library is the extension's own data. Losing it because another tab has it open is a worse outcome than waiting.                          |
| Close the other connection                                  | The extension does not own the other tab's connection, and closing a database out from under another tab would lose that tab's unsaved work. |

## Consequences

### Positive

- Two tabs of the extension no longer break each other's library.
- No connection is leaked, so the library's next schema change is not
  blocked by an earlier run of the extension.
- The worker no longer raises unhandled rejections when the library cannot
  be opened.

### Negative

- The open can now wait, and the user may see the library take a moment to
  appear. That is what the browser does, and it is better than an error. The
  diagnostics log records when it happens.

### Neutral

- The store's constructor takes an optional callback. The default is to do
  nothing, so nothing else changes.
