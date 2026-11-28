# ADR-0040 — The saved selectors belong to the story, not to the first chapter

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0011](./ADR-0011-site-selectors.md), [ADR-0002](./ADR-0002-parser-contract.md)

## Context

The workbench's **site selector** panel lets the user say where a site's
chapter list, chapter title and unwanted elements are. The selectors are
saved under the host name of the **story page** — the page the user was
looking at when they wrote them down.

The default parser reads the selectors back while it reads the **chapters**.
It used to cache the lookup in a single field, taken from the first
document that happened to reach it, and it never looked again.

Two things go wrong with that:

- **The host is often the wrong one.** A site may serve its chapters from a
  different host than its story page — a mirror, a subdomain, a CDN. The
  selectors were saved under the story's host and looked up under the
  chapter's, so they were never found. The user saved their selectors, the
  workbench said it had saved them, and the download quietly ignored them
  and fell back to guessing.
- **The answer is frozen after the first document.** Even on a site where
  every chapter comes from the same host, the parser kept whatever the very
  first lookup found. A parser is chosen once per download and used for every
  chapter, so the first chapter decided for all of them.

## Decision

The lookup is keyed by the host of the document being read, and the story's
host is the fallback.

The parser now knows the URL it was chosen for. The registry sets it when it
builds the parser, so the story's host is available for the whole download.

For each document, the parser looks for saved selectors in this order:

1. The host of the document's own base address.
2. The host of the story the parser was chosen for.

The first match wins. A site that has its own saved selectors for the host
that serves its chapters still uses those; a site that does not falls back
to the story's, which is where the user saved them in the first place.

The results are cached per host, so the lookup still happens once per host
rather than once per chapter.

## Alternatives considered

| Option                                                  | Why it was rejected                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache the first lookup, as before                       | The bug. The first chapter decides for the whole book, and it decides under the wrong host name.                                                                              |
| Look the selectors up under the chapter's host only     | A mirror's host has no saved selectors, so the user's own selectors are ignored — which is the case that mattered.                                                            |
| Look them up under the story's host only                | A site that has saved selectors for the host that serves its chapters would lose them. The two hosts are not interchangeable.                                                 |
| Look them up on every chapter                           | Correct, but wasteful: the store is read synchronously from a cache, once per chapter, for a book that may have thousands of them. The per-host cache gives the same answers. |
| Ask the user to save the selectors twice, once per host | The user cannot know which host will serve the chapters before the download starts, and asking them to guess is the friction this panel exists to remove.                     |

## Consequences

### Positive

- The selectors the user saved are found on the sites that serve their
  chapters from another host.
- A parser no longer lets the first chapter decide for the rest of the book.
- The lookup is still made once per host, not once per chapter.

### Negative

- A site whose chapters are served from a mirror that _has_ its own saved
  selectors uses the mirror's. That is the right answer — the selectors
  describe the markup, and the mirror's markup is what is being read — but
  it is a change of behaviour for such a site.

### Neutral

- The parser carries one more field, and the registry passes one more
  argument when it builds a parser.
