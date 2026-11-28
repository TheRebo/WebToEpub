# ADR-0045 — The browser follows redirects, and a rule keeps them public

- **Status:** Accepted
- **Date:** 2026-11-28
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0032](./ADR-0032-what-the-extension-may-fetch.md), [ADR-0036](./ADR-0036-granted-by-name.md), [ADR-0007](./ADR-0007-permissions.md)

## Context

ADR-0032 checks every address before it is fetched, and the fetch layer
followed redirects by hand so it could check every hop too. It asked the
browser for `redirect: "manual"`.

In Firefox, an extension that asks for that gets an `opaqueredirect`
response: status 0, no headers, no `Location`. Checked in the bundled
Firefox against the end-to-end fixture. The hand-written loop never saw a
redirect. It returned the opaque response as if it were the page, and the
caller failed with "HTTP 0". A chapter that moved, an `http` link to an
`https` site, an image behind a CDN redirect: every one of them failed.

## Decision

The browser follows redirects (`redirect: "follow"`). Two things keep a
redirect out of the user's own network:

1. **A network rule.** A dynamic declarative-net-request rule, scoped to the
   extension's own requests, blocks every host `isPrivateHost` calls private.
   Each private host the user granted by name gets a higher-priority allow
   rule, rebuilt whenever a grant changes. The request to a private hop is
   never made. Checked in the bundled Firefox: a session or dynamic rule does
   block the extension's own `fetch`, including a redirect hop.
2. **A check of the final address.** When a response says it was redirected,
   its final URL goes through `mayFetchUrl` before the body is read. This
   covers a browser where the rule could not be installed.

The first address is still checked before the request, as before.

## Alternatives considered

| Option                             | Why it was rejected                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Keep `redirect: "manual"`          | The bug. An extension cannot see where a manual redirect points.                                   |
| Check only the final address       | A redirect could still send one request into the user's network before the answer was thrown away. |
| Ask for `webRequest` to watch hops | A permanent grant to watch every request in the browser, which ADR-0007 removed on purpose.        |

## Consequences

### Positive

- Redirected chapters and images load.
- A redirect into the user's network is blocked before it is sent.

### Negative

- The rule's pattern and `isPrivateHost` must agree. A test compares them on
  the same list of addresses.
