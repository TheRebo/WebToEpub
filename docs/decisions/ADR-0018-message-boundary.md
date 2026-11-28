# ADR-0018 — Validate every message's payload at the bus

- **Status:** Accepted
- **Date:** 2025-11-25
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0005](./ADR-0005-background-worker.md), [ADR-0004](./ADR-0004-fetch-layer.md)

## Context

The message bus is the boundary between the extension's own pages — the popup,
the workbench, the options page — and the background worker. Everything the
worker does on the user's behalf arrives through it.

The bus had types. `RequestMap` described what each request's payload
_should_ contain, and the pages were written against those types. But types
are erased at runtime: a message arriving from `browser.runtime.onMessage` is
just `unknown`. Nothing checked the shape of what arrived before it was
handed to a handler that assumed the shape.

The consequence was a failure that pointed in the wrong direction. A
malformed payload reached a handler, the handler tried to read a property
that was not there, and the failure surfaced as a `TypeError` from inside the
worker. The user was told the site could not be reached. The site was fine.

The same boundary already had two validators — `validateFetchableUrl` for
URLs and `validateOrigin` for host permissions — but they lived in the
handlers, so a new handler had to remember to call them. One handler did not:
`download:start` interpolated the payload's URLs into the fetch list without
checking them, which meant a page could ask the extension to fetch a `file:`
URL or a URL on the local network and have the extension act as its proxy.

## Decision

We will validate the payload at the bus, before any handler sees it.

- `PAYLOAD_RULES` describes, for each request, the shape its payload must
  have. The rules are derived from the same types the pages are written
  against, so the two cannot drift apart silently.
- `isValidPayload(type, payload)` answers whether a payload is acceptable.
- `handleRequests` calls it before dispatching. A payload that does not match
  is answered with an error rather than being handled.

The error is raised as a `UserFacingErrorError`, not a plain `Error`. The
error translation turns a plain exception into "Could not reach the site.",
which is exactly the wrong thing to tell someone whose message was malformed.
A user-facing error keeps its own wording.

The URL and origin validators stay where they are, in the handlers that use
them, because they are about _what may be fetched_ rather than about the
shape of a message. `download:start` now validates every URL it is given,
which it did not before.

## Alternatives considered

| Option                                    | Why it was rejected                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Trust the types                           | Types are erased at runtime; a message is `unknown` when it arrives          |
| Validate in every handler                 | Easy to forget, and one handler already had                                  |
| Validate in the pages that send           | The pages are the extension's own; the worker should not trust its callers   |
| Validate the whole envelope and reject it | A message with one bad field would be discarded entirely, hiding which field |
| Use a schema library                      | A dependency for a handful of rules that fit in one table                    |

## Consequences

### Positive

- A malformed message is answered with a clear error instead of crashing a
  handler.
- The rules live in one table, so a new request cannot be added without a
  rule.
- The user is told what actually went wrong.

### Negative

- One more table to keep in step with `RequestMap`. The type checker does not
  enforce that a new request has a rule, so it is a reviewer's job.
- The rules check shape, not meaning. A payload can have the right shape and
  still name a site the extension may not fetch; that is what the URL and
  origin validators are for.

### Neutral

- The pages are unaffected; they were already sending well-formed payloads.
