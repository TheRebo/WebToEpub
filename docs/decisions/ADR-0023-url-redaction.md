# ADR-0023 — Redact URLs before they reach a log

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0004](./ADR-0004-fetch-layer.md), [ADR-0029](./ADR-0029-diagnostics-logger.md), [ADR-0007](./ADR-0007-permissions.md)

## Context

Kintsugi logs a fair amount: which parser handled a site, how long a request
took, how many chapters a story has, which chapter failed. That logging is
useful — it is how a user reports a broken site, and how we find out that a
site changed its layout.

The dangerous part is the URL. A story site's URL often carries more than the
story's address:

- A signed image URL, with a token and an expiry in the query string.
- A session identifier, in a query parameter or a cookie.
- The user's own search terms, when the URL came from a search.
- A private share link, where the path segment _is_ the secret.

A log is somewhere a URL ends up that the user did not choose to share. The
console is visible to any extension with debugging access, it is pasted into
bug reports, and it is captured by the browser's own diagnostics.

## Decision

We will never log a URL as it was given.

- A logged URL keeps its origin and its path, and loses its query string and
  its fragment. `redactUrl` is the only way to put a URL into a message.
- A URL that cannot be parsed is not logged at all. It is replaced with
  `<unparsable url>`, because a malformed URL is more likely to be a secret
  that failed to parse than a harmless string.
- The diagnostics logger is the only place that logs, and it is off by
  default. See [ADR-0029](./ADR-0029-diagnostics-logger.md).

## Alternatives considered

| Option                                  | Why it was rejected                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Log the URL in full                     | A signed image URL or a session identifier would end up in the console and in every bug report that quotes it.  |
| Log only the origin                     | The origin does not identify a chapter. A log that cannot say which chapter failed is not worth having.         |
| Log the path but strip the last segment | The last segment is what identifies the chapter, and it is the least likely part to be a token on a story site. |
| Redact at the call site                 | It would be forgotten. Redaction belongs in the one function that writes the message.                           |
| Strip the query but keep the fragment   | A fragment is never sent to the server and never identifies a resource, so it carries no diagnostic value.      |

## Consequences

### Positive

- A diagnostic log cannot leak a signed image URL or a session token.
- The redaction is in one place, so it cannot be forgotten at a call site.
- The path is kept, so a log can still say exactly which chapter failed.

### Negative

- The query string is never logged, so a log cannot show which parameter
  caused a site to return the wrong thing. That is the price of the rule.
- A signed image URL looks the same as an unsigned one in the log, so the log
  cannot be used to tell whether a signature has expired.

### Neutral

- The redaction is applied to the diagnostics logger only. A URL that the
  extension _fetches_ is used in full, of course; the rule is about what is
  written down, not about what is requested.
