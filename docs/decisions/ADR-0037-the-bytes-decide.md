# ADR-0037 — The bytes decide what an image is

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0008](./ADR-0008-epub-pipeline.md), [ADR-0024](./ADR-0024-check-what-came-back.md), [ADR-0031](./ADR-0031-epub-specification-conformance.md)

## Context

An EPUB's manifest has to name a media type for every file it lists, and the
file's name has to end in an extension that matches it. The extension was
taking both from the `Content-Type` the server sent, which is not always there
and is not always right:

- A server that sends **no** `Content-Type` produced a manifest entry with an
  empty media type and a file named `picture.bin`. A reader that finds an
  image listed with no media type shows nothing for it.
- A server that calls a PNG a JPEG produced a file whose bytes are a PNG and
  whose manifest entry says it is a JPEG — and whose name ends in `.jpg`.
- The extension **accepted** `image/avif`, `image/bmp`, `image/x-icon` and
  `image/vnd.microsoft.icon`, but had no file extension for any of them, so
  every one of them was written into the book as a `.bin` file.

The root cause is that the server was asked to answer a question it cannot
answer reliably. A server knows what it _meant_ to send; the bytes know what
was _sent_. A proxy, a CDN, a misconfigured handler and a caching layer can
all change the first without changing the second — and only the second is what
the reader will look at.

## Decision

We will read the media type out of the bytes.

- A new module, `epub/image-format.ts`, recognises the picture formats the
  extension writes by their signatures: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF
  and SVG. Every format has a signature the server cannot get wrong about its
  own file.
- The fetch layer uses the recognised format as the media type. The server's
  `Content-Type` is the tie-breaker when the bytes say nothing — some servers
  serve images through a proxy that rewrites the bytes — and is otherwise
  ignored.
- Bytes that match no picture format, and that the server gave no type for,
  are **refused**: the download reports the failure and the image becomes a
  visible placeholder. A file that nobody can identify cannot be put in a
  book.
- Every media type the extension accepts now has a file extension of its own,
  so no image is written as a `.bin`.
- The packer never writes an empty media type into the manifest, whatever it
  is given.

## Alternatives considered

| Option                                                  | Why it was rejected                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Trust the server's `Content-Type`                       | It is the source of every one of the defects above: missing, wrong, or naming a format with no extension of its own.                        |
| Guess the type from the file name                       | The name comes from the page, and the page is written by whoever wrote the site. A picture called `cover.png` is often a JPEG.              |
| Let the reader work it out                              | A reader that is handed `image/png` under the name `picture.bin` shows nothing. The manifest is the contract; the extension has to keep it. |
| Accept anything and let the manifest say `octet-stream` | A book whose images are all `application/octet-stream` is a book with no pictures in it, however the bytes are labelled.                    |
| Keep the server's type but fix only the empty case      | The wrong-type case is the same defect wearing a different hat: a PNG written as a JPEG is a picture a reader cannot show.                  |
| Sniff the bytes only, never fall back to the server     | Some servers serve images through a proxy that rewrites them. Refusing those would lose real pictures over a technicality.                  |

## Consequences

### Positive

- Every image in a book has a media type the reader understands and a file
  name that matches it.
- A server cannot mislabel a picture into a book and have it break there.
- No image is written as a `.bin`.

### Negative

- A picture in a format the extension does not recognise is refused where it
  used to be written. It becomes a placeholder the user can see, rather than
  a file in the book that shows nothing.
- The format check reads the first bytes of every image. That is cheap — the
  head of a file is already in hand — but it is work the extension did not do
  before.

### Neutral

- The SVG check is deliberately loose: an SVG is text, and a file that begins
  with `<svg` or an XML declaration is one. A picture that begins with an
  HTML doctype is not.
