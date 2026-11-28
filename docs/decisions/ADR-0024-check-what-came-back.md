# ADR-0024 — A response has to be what was asked for

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0004](./ADR-0004-fetch-layer.md), [ADR-0016](./ADR-0016-package-images.md), [ADR-0031](./ADR-0031-epub-specification-conformance.md)

## Context

The extension fetches two kinds of thing: pages, and images. It fetches them
from sites it does not control, over links it did not write, from pages that
may have changed since the user last saw them.

A server answers with whatever it likes. A chapter URL that has expired can
answer `403` with an HTML error page. A CDN can answer an image request with
a "you have run out of bandwidth" page, as `text/html`. A site can answer an
image request with an HTML page that _looks_ like the image because it is a
screenshot of one.

None of these are exotic. They are what a real site does on a real day.

The consequence of writing them unexamined is a corrupt book. The extension
would take the HTML error page, note that it is not an image, and write it
into the EPUB's manifest with an `image/jpeg` media type and a `.jpg` file
name. Every e-reader then refuses the whole book — not just the broken image,
the _book_ — because the manifest and the container disagree.

## Decision

We will check what came back before we use it.

- A response for a **page** has to have a page media type: `text/html`,
  `application/xhtml+xml`, `application/xml` or `text/xml`.
- A response for an **image** has to have an image media type. SVG is only
  fetched when the user has allowed remote images, because an SVG can carry
  script.
- A response with **no** `Content-Type` at all is accepted. Some servers omit
  it, and the check on the content itself is made by whatever consumes it —
  the image bytes are decoded, and a decode failure is a failure whether or
  not the header was there.
- A response whose type is wrong is a **failure**, and it is reported as one.
  It is not written into the book and hoped for.

The check lives in one module (`net/media-types.ts`) so that "what counts as a
page" and "what counts as an image" are answered once.

## Alternatives considered

| Option                                  | Why it was rejected                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trust the file extension                | The extension comes from the URL, which came from a page the site controls, which is exactly what is not being trusted.                             |
| Trust the magic bytes only              | Magic bytes cannot tell an SVG from an HTML page, and cannot tell a PNG from a polyglot. Content type and content shape answer different questions. |
| Accept anything and let the reader cope | The reader does not cope: a manifest that disagrees with its container makes the _whole book_ unreadable.                                           |
| Reject a missing `Content-Type`         | It would break real sites that omit the header — a large class of them — for no security gain.                                                      |
| Check the image by decoding it          | Decoding is the right check for images, and it is done too; the media type check catches the case earlier, before the bytes are held.               |

## Consequences

### Positive

- A book is never assembled from a response that was not what was asked for.
- The failure is reported with the URL and the type that arrived, so a user
  can see that a site served an error page instead of an image.
- The rules are in one place, so "an image" means the same thing everywhere.

### Negative

- A site that serves images as `application/octet-stream` — which happens —
  is refused. The user can still download the page and its text; only that
  image is missing.
- A site that lies about the type of a perfectly good image is refused for
  that image. The type is checked first and the bytes second, so the error
  names the reason.

### Neutral

- A missing content type is accepted, so the check is a filter rather than a
  proof.
