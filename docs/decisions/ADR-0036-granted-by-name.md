# ADR-0036 — "The extension may read this" is not "the user allowed this host"

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0007](./ADR-0007-permissions.md), [ADR-0030](./ADR-0030-host-access-one-site-at-a-time.md), [ADR-0032](./ADR-0032-what-the-extension-may-fetch.md)

## Context

The extension ships with no host permissions. It asks for one site at a time, at
the moment the user chooses that site — and it also declares an _optional_
permission covering every `http:` and `https:` host, which the user may grant
once if they want the extension to work on any site without asking again.

Those two grants look alike to the browser's `permissions.contains()` API, and
that API answers the question it is asked:

> `permissions.contains({ origins: ["http://127.0.0.1/*"] })` → **true**, when
> the extension holds the optional `http://*/*` grant.

So `hasHostAccess()` — which asks the browser — returns `true` for _any_ host
once the broad grant is in place. That is the right answer to the question it
was written for ("may the extension read this page?"), and the wrong answer to
the question the private-host rule asks ("did the user allow this machine?").

The consequence was a hole in the rule from ADR-0032. The private-host guard
consulted `hasHostAccess()`, so a user who had granted the broad optional
permission had no private-host protection at all: any story site could link to
`http://192.168.1.10/`, `http://127.0.0.1:8080/` or
`http://169.254.169.254/latest/meta-data/` and the extension would fetch it.
The broad grant is the extension's own optional permission — it is not the user
saying "and my local network too".

The same file already knew the two things were different: `listHostAccess()`
filters the broad grant out of the list of allowed sites, because showing it to
the user would claim the extension can read the whole web. The distinction was
understood in one place and missed in another.

## Decision

We will keep two questions and two answers, and stop using the browser's answer
for the wrong one.

- **`hasHostAccess(origin)`** — _may the extension read this page?_ It asks the
  browser, and the browser's answer covers every grant the extension holds,
  including the broad optional one. This is what the site-access UI uses: when
  the user opens the extension on a page, the extension has to know whether it
  may read that page, and the broad grant genuinely means it may.
- **`hasSpecificHostAccess(origin)`** — _did the user allow this host?_ It looks
  through the granted patterns for one that names this host, and the broad
  grant is not one of them. This is what the private-host rule uses.

The private-host rule in `mayFetchUrl()` now asks the second question. A
private host is fetched only when the user granted that host by name.

## Alternatives considered

| Option                                                                   | Why it was rejected                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drop the optional "all sites" permission entirely                        | It is a real convenience, and it is the user's choice to make. Removing it would take away a feature to paper over a logic error.                            |
| Make `hasHostAccess()` mean "granted by name" everywhere                 | The site-access UI would then tell the user it may not read a page it may read, and would ask for a grant it already holds. The two questions are different. |
| Check the origin against the granted patterns by hand in `mayFetchUrl()` | The rule about what a grant means belongs with the grants, not with the caller. One module owns host access.                                                 |
| Refuse private hosts outright                                            | A story served from a home server is a real use. The grant is the answer.                                                                                    |
| Use `permissions.contains()` and additionally exclude wildcards          | `contains()` takes the whole set of grants; there is no way to ask it about one of them. The set has to be read and judged.                                  |

## Consequences

### Positive

- The private-host guard works again, whatever grants the extension holds.
- A page on any site on the web can no longer use the extension as a way into
  the user's own network.
- The two meanings of "the user allowed this" are named, and the UI keeps the
  one that matches what a user thinks about.

### Negative

- `hasSpecificHostAccess()` reads the whole granted set with
  `permissions.getAll()` instead of asking about one pattern. It is called only
  for private hosts, which are rare, so the cost does not matter.
- A user who granted the broad permission and reads a story from
  `http://localhost:8080` now has to allow that host explicitly. That is the
  trade the rule has always made, and the error message says so.

### Neutral

- `hasHostAccess()` is unchanged, so the site-access UI behaves exactly as
  before.
