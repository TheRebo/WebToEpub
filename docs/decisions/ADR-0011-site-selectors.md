# ADR-0011 — The default parser: a visible guess, and a way to replace it with an answer

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0002](ADR-0002-parser-contract.md), [ADR-0005](ADR-0005-background-worker.md), [ADR-0006](ADR-0006-storage.md)

---

## Context

The extension's value is its **434 site parsers**, covering ~659 host names.
Every one of them is a hand-written description of one site's layout. They are
the asset; everything else in the product exists to serve them.

That coverage is never complete. New sites launch, sites redesign, and some
sites were never covered to begin with. When no parser matches, the extension
still has to do *something* — otherwise the user gets a dead end and blames the
extension.

The baseline handled this with a `DefaultParser`: a ~200-line heuristic that
guessed a table of contents and a chapter body from common CSS class names,
and stored per-site overrides in `window.localStorage`.

Three problems with that arrangement:

1. **The guess was invisible.** The user could not tell whether the chapters
   they were about to download had been read from the site or guessed at. The
   baseline showed the same UI either way.
2. **The guess was often wrong.** The heuristic produced *plausible* garbage —
   a list of forty navigation links presented as a chapter list — and the user
   found out only after the download had finished.
3. **The override was unreachable.** The baseline's `DefaultParserConfigs` was
   a `localStorage` key edited by hand. There was no UI that could write it.

## Decision

We keep the fallback parser — a product that refuses to work on an unknown
site is worse than one that guesses — but we change **three** things about it.

### 1. The guess is announced

When the fallback parser is in charge, the worker tells the page so, and the
workbench shows a **banner** above the chapter list:

> **No parser for this site**
> Kintsugi is guessing where the story is. Tell it once and it will remember.
> `[ Set up this site ]`

The banner is warm, not alarming: the extension still works, it is just
guessing, and the banner is offering a way to stop. A banner rather than an
error is deliberate — the baseline's failure mode was a *silent* wrong answer,
and the fix is visibility, not obstruction.

The banner appears only while the fallback parser is in charge. Once the user
has saved selectors for the host, it disappears, because the extension is no
longer guessing.

### 2. The user can replace the guess with an answer

The banner opens a **site-selector dialog** with three CSS selectors:

| Selector | What it is | Required |
|---|---|---|
| Content | The element that holds the chapter's text | yes |
| Title | The element that holds the chapter's title | no |
| Remove | The elements to strip out (ads, comments, navigation) | no |

The dialog offers three ways to fill them in, because the user may know the
answer, may not, and may want to know before committing either way:

- **Suggest** — the worker fetches the page and runs the heuristic scanner
  over it, and proposes selectors. If the page looks like a table of contents
  rather than a chapter, the scanner says so instead of guessing.
- **Test** — the selectors are run against the live page and the number of
  characters they matched is reported. A selector that matches nothing is
  caught here, not after a 300-chapter download.
- **Save** — the selectors are stored against the host name.

**Forget this site** removes them again, from the dialog or from the options
page.

### 3. The answer is stored safely, and read from the worker

The saved selectors live in `browser.storage.local` under a namespaced key,
**not** in `localStorage`:

- `localStorage` is unavailable in a background service worker, and the
  rewrite moved the parsers there (ADR-0005). A `localStorage` store would
  have forced the parser to run in the page, or the store to be duplicated.
- The value is **validated on read and on write**. The content selector must
  be a non-empty string that the browser can actually parse. A selector that
  throws when it is used takes the whole chapter down with it, so it is
  rejected at the boundary rather than discovered mid-download.
- The store keeps an in-memory cache, so the parser can read its answer
  **synchronously** from inside the download pipeline, which is otherwise
  synchronous by contract (ADR-0002). The worker hydrates the cache once at
  start-up.
- Host names are normalised (lower-cased, `www.` stripped) so that
  `www.example.com` and `example.com` are one site, not two.

The scan-and-suggest machinery lives in the worker, not in the page. The
extension page has no access to the site's DOM — it is a `moz-extension:`
document — so testing a selector against a page means fetching it, and the
worker already owns the fetch layer with its cookies, retry policy and rate
limiting (ADR-0004). Doing it in one place means one fetch implementation,
not two.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **No fallback: show "unsupported site" and stop** | Honest, but it throws away a real use case. The baseline supported unknown sites, and a user on a new site is exactly the user who needs help most. Refusing is a product regression. |
| **Improve the heuristic and stay silent** | The heuristic cannot be made reliable: novel sites are arbitrary HTML. Visibility is what actually prevents the harm. |
| **Let the user write a parser in the page** | Far too much for a browser popup, and it would need a scripting environment, which we do not want to grant (ADR-0007). |
| **Store the overrides in `localStorage`, as the baseline did** | Unavailable in the service worker; unvalidated; and unscoped, so it collides with the page's own storage. |
| **Run the scanner in the extension page via a content script** | Possible, but it needs a message round-trip per page and duplicates the fetch layer. The worker already fetches the page; one implementation is better than two. |
| **Keep the banner until the user dismisses it** | The banner is a statement of fact ("I am guessing"). Once the selectors are saved, the fact is false, and a stale banner is worse than none. |
| **Validate the selectors only when they are used** | A throwing selector would then fail one chapter, in the middle of a download, with no explanation. Validating at the boundary turns a silent corruption into an immediate, visible error. |

## Consequences

### Positive

- The user always knows whether the chapter list was read or guessed.
- A site the extension does not know can be taught **once**, in one dialog,
  with three fields — and the answer survives.
- A wrong selector is caught by **Test**, before the download, not after it.
- The saved selectors are validated, scoped to a host, and removable.
- The options page lists every taught site, so the user can take one back.

### Negative

- The scanner is a heuristic and can be wrong. "Suggest" is a starting point,
  not an answer — which is why the dialog makes **Test** a first-class button.
- The saved selectors are **per host name**. A site that serves different
  layouts at different paths will need the selectors to be good enough for
  both, or the site will have to be split by path in a future iteration.
- The banner adds a state to the workbench that has to be designed, translated
  and tested. That is a real cost of choosing visibility over silence.
- The rewrite still has no way to *submit* a new parser upstream from inside
  the extension.

### Neutral

- The dialog deliberately does not offer "apply to similar sites". The stored
  key is a host name, matching the baseline's model.
- The scanner lives in the core (`heuristic-scanner.ts`), so it is testable
  without a browser.
