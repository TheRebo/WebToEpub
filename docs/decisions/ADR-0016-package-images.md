# ADR-0016 — Package the images the book actually references

- **Status:** Accepted
- **Date:** 2025-11-25
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0008](./ADR-0008-epub-pipeline.md), [ADR-0006](./ADR-0006-storage.md)

## Context

The download manager fetched every image a chapter referenced, but nothing
carried those bytes into the container. The chapter's markup still pointed at
the site's own servers, so a book saved by Kintsugi showed its pictures only
while the reader was online — and showed broken-image placeholders otherwise.

The baseline handled this by leaving the URLs alone as well. It was not a
mistake so much as an omission: the baseline's `EpubItem` carried images
through a parallel path that the rewrite's document model did not have.

Packaging the images is not simply a matter of copying the bytes into the
container. Three things have to line up:

1. The **file name** has to be stable, so the same image referenced by two
   chapters lands on one file rather than two.
2. The file name has to be **unique**, so two different images that happen to
   share a base name — `cover.jpg` is common — do not overwrite each other.
3. The chapter's **reference** has to match the file that was written, and it
   has to be resolved relative to the chapter's own directory.

## Decision

We will package every image a chapter references, and rewrite the chapter's
references to point at the packaged files.

- `imageFileName(url, mediaType)` derives the name from the URL's last path
  segment and an FNV-1a hash of the whole URL, so the name is stable, unique,
  and readable.
- `imagePath(url, mediaType)` places it at `OEBPS/images/<name>`.
- `chapterImageHref(url, mediaType)` produces the reference a chapter uses:
  `../images/<name>`, which resolves from `OEBPS/text/` to `OEBPS/images/`.
- The packer registers each packaged image as a manifest item, so a reader can
  find it. An image already in the container is not written twice and does not
  get a second manifest entry.
- The rewrite happens **after** the download, because the file name depends on
  the media type, and the media type is only known once the bytes have arrived.

`srcset` candidates and `<picture>` sources are rewritten too, because a
chapter that uses `<picture>` would otherwise lose its images.

## Alternatives considered

| Option                                            | Why it was rejected                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Leave the references pointing at the site         | The book only works online. This is the bug.                                            |
| Put the images at the root of the container       | The convention is `OEBPS/images`, and readers that rewrite paths cope better with it    |
| Name files by index (`image-1.jpg`)               | The same image in two chapters would be downloaded and written twice                    |
| Name files by the URL's base name alone           | Two images named `cover.jpg` would collide and overwrite each other                     |
| Rewrite the references before downloading         | The file name depends on the media type, which the response carries                     |
| Keep a single copy of each image, shared globally | The same approach, but the map is keyed per chapter so a chapter only owns what it uses |

## Consequences

### Positive

- A saved book is readable offline, which is the whole point of saving it.
- Images are written once, however many chapters use them.
- The reference and the manifest entry cannot drift apart, because both are
  computed from the same function.

### Negative

- A book with images is larger, and the download takes longer.
- The hash in the file name is not pretty. It is a trade for correctness.

### Neutral

- The chapter's own markup is unchanged apart from its image references.
