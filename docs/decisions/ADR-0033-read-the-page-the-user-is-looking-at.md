# ADR-0033 — Read the page the user is looking at

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0004](./ADR-0004-fetch-layer.md), [ADR-0005](./ADR-0005-background-worker.md), [ADR-0030](./ADR-0030-host-access-one-site-at-a-time.md)

## Context

A great many novel sites build their table of contents in the browser. The
markup that arrives over the wire is an empty shell with a script tag in it;
the list appears a moment later, drawn by the site's own JavaScript, from a
JSON endpoint the page calls.

Fetch that shell and the extension learns nothing. There is no chapter list
in it, so no parser — not the dedicated one, not the heuristic, not any of
the four hundred and thirty-four preserved ones — can find one. The user is
told the site is not supported while looking at a perfectly good table of
contents.

This is not a rare edge case. It is the normal shape of the modern web, and
it is the single most common reason a user says the extension does not work.

## Decision

We will read the page the way the user sees it, and fall back to fetching it.

- Before parsing a page, the extension looks for a tab that is showing that
  page. If it finds one, it runs a small function in that tab and asks it for
  the page's DOM **as it is now** — after the site's own scripts have filled
  it in.
- The function returns `document.documentElement.outerHTML` and nothing
  else. It runs in the page's own world, so it sees what the user sees.
- The returned markup is parsed with the **page's own address** as its base
  URL, so a relative chapter link — `/chapter/7` — resolves against the site
  it was found on, exactly as it would have in the page itself. Without that,
  every relative link would point at the extension's own pages.
- If there is no such tab, if the tab may not be touched, if the browser
  refuses the injection, or if the page is a special page the browser will
  not inject into, the extension **fetches the page itself** and carries on.
  This is a bonus, never a requirement.
- The fragment is left out of the comparison: it changes which part of the
  page is showing, not which page it is, and the DOM is the same either way.

## Alternatives considered

| Option                                   | Why it was rejected                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch the page and parse the shell       | The shell has no chapter list. This is the bug.                                                                                                                                                                                                                                            |
| Re-fetch the site's JSON endpoint        | The endpoint is per site, per site-format, and changes without notice; there are hundreds of them. A generic answer is better than hundreds of brittle ones.                                                                                                                               |
| Run the page's own scripts in the worker | They expect a document, a window, a history, and a cookie jar. Reproducing a browser in a worker is a project of its own.                                                                                                                                                                  |
| Require the page to be open              | The extension is asked to work on a URL; insisting the user also keep a tab open with it is friction for no gain.                                                                                                                                                                          |
| Use the content script instead           | The content script is already injected into the tab; asking it for the DOM would be simpler. But it runs in the page's world, where it can be seen and interfered with, and it is not present on every page the user has access to. The `scripting` call is made from the privileged side. |
| Make the live read the only path         | It fails whenever the page is not open, which is most of the time. A fallback is not optional.                                                                                                                                                                                             |

## Consequences

### Positive

- Sites that build their chapter list in the browser work, without a parser
  for each one.
- The extension reads the list the user is actually looking at, which is the
  list they expect.
- Relative links keep working, because the base URL is the page's own.

### Negative

- The live read needs the `scripting` permission, which is one permission
  more than a fetch-only extension would need. It is scoped to the tabs the
  extension has access to, and to a single function that returns markup.
- The live DOM may contain things the fetched page would not: the user's own
  session state, a banner the site showed them, a consent dialog. The
  content pipeline sanitises it, but the input is less predictable than a
  server's response.

### Neutral

- The fallback to fetching is always there and is always correct. The live
  read only ever makes the result better.
