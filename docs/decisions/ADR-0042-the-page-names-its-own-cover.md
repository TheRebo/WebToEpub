# ADR-0042 — The page's own word about its cover comes first

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0002](./ADR-0002-parser-contract.md), [ADR-0008](./ADR-0008-epub-pipeline.md)

## Context

The base parser's rule for finding a story's cover was the original's: take
the first `<img>` inside the content element.

That rule is a guess. It is right on the many sites that open a chapter with
the cover picture, and it is wrong on the sites that open with something
else — an advert, a "read the previous chapter" banner, a site's logo, a
social button. The book then carries an advert as its cover, and the reader
sees it as the first thing.

Meanwhile, most sites _say_ what their cover is. The Open Graph image
(`og:image`) is the convention for sharing a page, and it is put there by
whoever made the page. The Twitter card image and the older
`<link rel="image_src">` say the same thing. No parser in the extension read
any of them.

## Decision

The base parser looks for the page's own statement first, and only guesses
when the page says nothing.

The order is:

1. `meta[property="og:image"]`
2. `meta[name="og:image"]`
3. `meta[name="twitter:image"]`
4. `meta[property="twitter:image"]`
5. `link[rel="image_src"]`

and then the original's rule — the first image in the content element.

A site-specific parser that knows where its cover is still overrides the
method, and its answer is used as it always was. This change only affects
the parsers that do not know.

## Alternatives considered

| Option                                      | Why it was rejected                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Keep the first image in the content only    | The bug. The guess is right some of the time and wrong the rest, and the page's own statement is available.                    |
| Only use `og:image`, with no fallback       | A page with no Open Graph tags would have no cover at all, where before it had one. The guess is a better answer than nothing. |
| Search the whole page for the largest image | A large image is not a cover. It is usually a banner, and a book whose cover is a banner looks broken.                         |
| Use the site's logo                         | A logo is a logo, not a cover.                                                                                                 |

## Consequences

### Positive

- A book built from a site that names its cover gets the right picture.
- Sites that share their pages on social media — which is most novel sites —
  get the picture they chose to be seen as.

### Negative

- A site whose `og:image` is a social banner rather than the cover now gets
  the banner. Sites that set `og:image` do so on purpose, so this is
  usually what the site wants; but it is a change.

### Neutral

- Five selector lookups at most, on one document per download.
