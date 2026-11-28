# ADR-0039 — A relative image belongs to the page it was served from

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0004](./ADR-0004-fetch-layer.md), [ADR-0008](./ADR-0008-epub-pipeline.md)

## Context

A chapter's page may address its images relatively: `<img src="picture.png">`.
Such a reference means "the picture next to this page", and the place a
reader looks for it is the address the page was **served from** — not the
address that was **asked for**.

The two are usually the same. They are not the same when the site redirects:
a chapter asked for at `https://example.com/1` may be served from
`https://example.com/story/1`. The page's relative references belong to the
second address. Resolving them against the first sends every image to a
place that does not exist — and the book's pictures are broken in a way that
looks like the site's fault rather than the extension's.

The download manager resolved relative references against the chapter's
requested URL. The `fetchHtml`/`fetchChapter` path already knew the final
address: the fetch layer follows redirects and reports the URL the response
came from, and it puts that address into the document as a `<base>` so that
the browser's own resolution agrees. The download manager simply did not use
it.

## Decision

The base address of a chapter is the document's own base URI, with the
chapter's requested URL as the fallback.

The document's base URI is the right answer in every case the extension
meets, because it is what the browser itself uses:

- The fetch layer sets the document's base to the URL the response came
  from, so a redirected page resolves against the address it was served
  from.
- A site that ships its own `<base>` element keeps it, because the fetch
  layer only adds a base when the page has none. The first `<base>` in a
  document wins, so prepending one over a site's own would send every
  relative link on the page to the wrong place.
- A parser that builds a chapter from an API response gets a document whose
  base is that response's URL, which is the address its relative references
  belong to.

The base is used for both halves of the image work: collecting the URLs to
download, and rewriting the references in the packaged markup. Rewriting
against a different base than the collection would leave the book pointing
at addresses that were never fetched.

## Alternatives considered

| Option                                      | Why it was rejected                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve against the chapter's requested URL | The bug. It ignores the redirect entirely, so every relative image on a redirected page is fetched from the wrong address.                                                                                  |
| Resolve against the story's URL             | The story page is a different page. Its directory has nothing to do with the chapter's.                                                                                                                     |
| Follow the redirect again for every image   | The redirect has already been followed once; following it again for each image would multiply the requests and stall the download.                                                                          |
| Let the browser resolve each reference      | The browser's own resolution is exactly what `baseURI` reports. Reading it is the same answer without a network request — and the markup has to be resolved again later, when the references are rewritten. |

## Consequences

### Positive

- A site's relative images are fetched from the right place, redirected or
  not.
- The packaged markup's references point at the images that were actually
  downloaded, because both halves use the same base.

### Negative

- None. The base is read from a document the extension already has.

### Neutral

- The chapter's base is kept for the length of the job, in a map keyed by
  the chapter's URL. A job with thousands of chapters keeps thousands of
  short strings, which is nothing next to the chapters themselves.
