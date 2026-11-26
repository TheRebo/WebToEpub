# ADR-0032 — What the extension may fetch

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0004](./ADR-0004-fetch-layer.md), [ADR-0007](./ADR-0007-permissions.md), [ADR-0023](./ADR-0023-url-redaction.md), [ADR-0030](./ADR-0030-host-access-one-site-at-a-time.md)

## Context

The extension fetches from its own privileged context, and that context can
reach further than the page that asked. A content script on a story site can
only fetch from that site; the worker can fetch from anywhere the user has
granted it access to, and from anywhere it has not, too.

That is worth being careful about, because the URLs the extension fetches are
not only the ones the user typed. They come from the page: a chapter list
contains links, a chapter contains images, and a site controls both. A
compromised or simply careless site can put a link to anything into its own
markup.

Two different questions have to be asked of every URL, and they have two
different answers.

**May this URL be fetched at all?** A `file:` URL reads the user's disk. A
`data:` URL can carry a script that runs in the extension's own page. A
`blob:` URL refers to an object that only exists in some other context. None
of them is ever a chapter.

**May this host be reached?** A public host is the whole point of the
extension. A host that names the user's own machine, or a private network, is
a different matter: `http://169.254.169.254/latest/meta-data/` is the
cloud metadata service, and on some networks it hands out credentials to
anything that asks.

## Decision

We will check every URL before it is fetched, in one place.

- A URL is fetched only if it is an **absolute `http:` or `https:` URL**. A
  `file:`, `data:` or `blob:` URL is refused outright, whatever the user has
  allowed. The shape of the URL is checked before the host rule, so a
  disallowed scheme is refused even on an allowed host.
- A **public** host may be fetched. That is what the extension is for.
- A **private** host — loopback, link-local, the RFC 1918 ranges, the
  `.local` names, a bare host name — is fetched only when the user has
  granted the extension access to that host. A story served from a home
  server is a real thing; a chapter list that links to a metadata service is
  an attack. The difference is the user's own grant.
- The grant is checked **per host**. A table of contents on a site the user
  allowed cannot use that allowance to reach a machine the user never
  allowed.
- The check is done in the fetch layer, so no caller can skip it.

`mayFetchUrl` is the single function that answers the question, and it returns
the parsed URL when the fetch may go ahead and `null` when it may not.

## Alternatives considered

| Option                                     | Why it was rejected                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch anything the page links to           | A page controls its own links. Anything it points at is a request the user never made and never saw.                                                                    |
| Refuse all private hosts                   | A story served from `http://localhost:8080` is a real use, and the extension is useless for it. The grant is the answer, not a blanket refusal.                         |
| Allow any host the extension has access to | That is the rule, but it must be evaluated per URL rather than per session: an allowance for one site must not become an allowance for a machine on the user's network. |
| Refuse only the link-local range           | `169.254.169.254` is one address of a whole class: loopback, the RFC 1918 ranges and the `.local` names are all the same kind of thing.                                 |
| Let the browser decide                     | The browser's reachability is not the question. The question is what the extension should ask for, and the browser will happily ask.                                    |
| Strip the query and fetch anyway           | A URL is refused as a URL. There is no version of it that is safe.                                                                                                      |

## Consequences

### Positive

- A page cannot use the extension to reach the user's own network.
- The `file:` and `data:` schemes are refused everywhere, in one place.
- A home server works, provided the user has said so.

### Negative

- A user who has granted one site and reads a story that links to a CDN on a
  private address gets nothing for that link. The failure is reported
  plainly rather than silently skipped.
- The private-host list is a list. An unusual private address that is not on
  it is treated as public. The list covers the ranges and the names that
  matter; see `util/sanitize.ts` for it.

### Neutral

- The check costs one URL parse and, for a private host, one permission
  lookup. Neither is on the hot path for a public site.
