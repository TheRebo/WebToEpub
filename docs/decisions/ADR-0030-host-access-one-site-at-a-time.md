# ADR-0030 — Host access is asked for one site at a time, from the page

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0007](./ADR-0007-permissions.md), [ADR-0020](./ADR-0020-first-run-explains-itself.md), [ADR-0032](./ADR-0032-what-the-extension-may-fetch.md)

## Context

The extension has to read the site the user names. In Firefox that means a
host permission, and a host permission is a grant the user makes to a
_pattern_ — not to a site, but to every page under it, for as long as it
stands.

Two things follow from that, and both matter.

The first is that the permission has to be requested from somewhere the user
can see and act on. Firefox will not honour a request that comes from the
background worker, because there is no user gesture behind it: there is
nobody to click "Allow". A prompt that appears without the user having asked
for something is exactly the kind of thing people are trained to dismiss — and
a dismissed prompt is a permanent "no".

The second is that the pattern is coarser than the site. `https://example.com/*`
covers every path on that host, including the user's account page. There is no
way to ask for one chapter page and not the rest. The only thing that can be
narrowed is _which host_ is asked for at all.

## Decision

We will ask for host access one site at a time, from the page, at the moment
the user names the site.

- The extension ships with **no** host permissions. Nothing is pre-granted,
  nothing is granted at install time, and nothing is granted for a site the
  user has not named.
- The request is made from an extension page, in the handler of a real click.
  The background worker cannot make it, and does not try.
- The pattern is built from a validated origin and covers the whole host:
  `https://example.com/*`. It is never a wildcard the extension's own.
- A pattern carries **no port**. A browser's host permission is a scheme, a
  host and a path; a port is not part of it, and a pattern that named one
  would match nothing. The grant therefore covers every port on the host,
  which is the browser's model and not a choice this extension makes.
- Once granted, the site stays granted until the user removes it. The
  options page shows which sites are granted and lets the user revoke them.
- A site the user has granted is remembered, so the permission prompt is not
  asked for again on the next visit.

The origin is validated before it becomes a pattern: it has to parse as an
absolute `http:` or `https:` URL, and nothing else does.

## Alternatives considered

| Option                                     | Why it was rejected                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask for `<all_urls>` at install time       | The broadest grant, made before the user has done anything, for an extension that only ever needs the site they name.                           |
| Request the permission from the worker     | Firefox refuses it: there is no user gesture. A prompt that cannot be acted on is a prompt that is always denied.                               |
| Request on a timer, "just in case"         | A permission prompt the user did not ask for is an interruption at best and an attack at worst.                                                 |
| One optional host permission per site      | This is the chosen design; the row is here to say it was considered and kept.                                                                   |
| Ask for the exact path of the chapter      | Host permissions are not path-scoped in a way that helps here, and a per-path grant would have to be requested for every chapter of every book. |
| Re-request on every visit                  | A prompt per page is a prompt per page, for a grant the user has already made.                                                                  |
| Keep the granted sites in a separate store | The browser already keeps them, and can show and revoke them. A second copy could disagree with the browser's.                                  |

## Consequences

### Positive

- The extension's standing grant is the smallest it can be: nothing until
  the user asks.
- The prompt appears when the user is doing the thing that caused it, so it
  can be answered.
- The user can see and revoke every site the extension has been given.

### Negative

- The first use of each new site costs a prompt. That is the cost of not
  asking for everything up front.
- The grant covers a whole host, which is wider than the chapter that caused
  it. There is no narrower grant to ask for.

### Neutral

- The grant does not expire on its own. Firefox shows it in the add-on's own
  permissions panel, and the options page mirrors it.
