# ADR-0008 — Rebuild the EPUB pipeline on a real EPUB reader/writer

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0002](ADR-0002-parser-contract.md)

---

## Context

The baseline's EPUB pipeline is a three-stage string-and-DOM pipeline:

```
WebPage.rawDom
   → Parser.convertRawDomToContent()      (findContent, clean, decorate)
   → EpubItem.makeChapterDoc()             (DOMPurify boundary, XHTML doc)
   → EpubItemSupplier                      (manifest, spine, ToC)
   → EpubPacker.assemble()                 (OPF, NCX, nav, ZIP via zip.js)
```

Three things about it are good and must be preserved:

- The **DOMPurify boundary** at `EpubItem.makeChapterDoc` (`EpubItem.js:64-75`)
  is a single, well-placed sanitisation point.
- The **`Chapter → EpubItem → EpubItemSupplier → EpubPacker`** data model is
  clean and testable.
- The EPUB 2 / EPUB 3 dual output (NCX + nav document) is a real feature.

Three things about it are wrong:

1. **The library merge is regex surgery on XML.** `Library.LibMergeEpub`
   (`Library.js:60-198`) merges two EPUBs by `RegExp`-replacing `<dc:source>`,
   `<item>`, `<itemref>`, and `<navPoint>` fragments inside `content.opf` and
   `toc.ncx`. This assumes the _exact_ serialisation of the baseline's own
   `EpubPacker`. Any EPUB produced by another tool — or by a future version of
   this extension — will not match, and the merge silently produces a
   malformed OPF. It also indexes `filter(...)[0]` without a guard, so a
   missing `content.opf` throws.

2. **Failed images are packed as zero-byte files.** `ImageCollector.fetchImage`
   catches a fetch/decode failure and pushes the `ImageInfo` into the pack
   list anyway (`ImageCollector.js:440-445`). `ImageInfo.packInEpub` then
   does `new Blob([this.arraybuffer])` where `arraybuffer` is `null`
   (`EpubItem.js:209-212`). The result is a 0-byte image in the manifest,
   which many readers reject as a corrupt EPUB.

3. **`ImageCollector.getImageDimensions` rejects after computing fallback
   dimensions** (`ImageCollector.js:311-317`), so the fallback is discarded
   and the image is treated as failed — feeding directly into (2).

## Decision

We rebuild the pipeline with the same architecture but a **real EPUB
document model**, and we fix the failure semantics.

### 1. A typed document model

```ts
interface EpubDocument {
    metadata: EpubMetadata;
    manifest: ManifestItem[];
    spine: SpineItem[];
    nav: NavigationDocument; // EPUB 3 nav + EPUB 2 NCX, both generated
    resources: Map<string, Blob>; // images, fonts, stylesheets
}
```

Parsing and writing go through a small, dependency-free
`EpubDocumentReader` / `EpubDocumentWriter` pair that use `DOMParser` and
`XMLSerializer` — **not** regex. The writer emits a deterministic, canonical
serialisation, so two runs of the same book produce byte-identical output
except for the timestamp. That determinism is what makes the library merge
safe.

### 2. The merge becomes structural

```ts
async function mergeEpubs(base: Blob, addition: Blob): Promise<Blob>;
```

- Parse both containers with `zip.js`'s reader.
- Parse both `content.opf` documents into the typed model.
- Merge manifests, spines, nav/NCX, and resources, **rewriting id collisions**
  deterministically (a prefix derived from a hash of the source id).
- Rewrite intra-document links.
- Serialise the merged model and write a new container.

No regex touches XML anywhere in the product.

### 3. Failure semantics are explicit

A resource that failed to download is **not** packed. Instead:

- the image element in the chapter is replaced with a **visible, styled
  placeholder** (`<span class="kintsugi-missing-image" role="img"
aria-label="Image unavailable">`) that carries the original source URL, so
  the reader knows something was there;
- the failure is recorded in the error log and reported in the completion
  summary: _"3 images could not be downloaded."_;
- the EPUB is still produced, and it is **valid**.

We never write a zero-byte file into a container.

### 4. Image dimensions never reject

`getImageDimensions` returns a fallback size instead of rejecting, so a
decode failure does not discard the image.

### 5. Determinism

- The OPF, NCX, nav document, and every XHTML file are serialised
  canonically (fixed attribute order, fixed newline, UTF-8).
- The only non-deterministic field is the OPF `dcterms:modified` timestamp,
  which is the EPUB spec's requirement.
- A unit test asserts that building the same book twice produces identical
  bytes apart from that timestamp. This is what makes "rebuild the library
  entry" safe.

## Alternatives considered

| Alternative                                      | Why rejected                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep the regex merge but harden it**           | Regex over XML cannot be made safe. The failure mode is silent corruption of the user's book — the worst possible bug for this product. |
| **Adopt an EPUB library (epub.js, JSZip, etc.)** | `epub.js` is a _reader_, not a writer, and is large. JSZip would replace `zip.js`, which already works.                                 |
| **Build the OPF as strings, as today**           | String-built XML is how the merge became regex surgery in the first place. A DOM-based model makes the merge structural for free.       |
| **Drop the library merge feature**               | It is the extension's differentiator — "search for new chapters and update the book" is why the library exists.                         |
| **Fail the whole EPUB if any image fails**       | Too brittle. A missing illustration should not cost the user the entire book.                                                           |
| **Keep `zip.js`**                                | It is 30 KB minified, supports streaming writes, has no known advisories, and already works. Replacing it would be churn.               |

## Consequences

**Positive**

- The library merge is **safe** for any EPUB, not just ones this extension
  produced.
- The produced EPUB is **never corrupt** because of a failed image.
- Deterministic output makes the library's "update" operation reproducible
  and testable.
- The reader/writer pair is unit-testable without a browser.

**Negative**

- A DOM-based OPF writer is more code than string concatenation. It is
  roughly 200 lines, and it replaces a fragile regex merge of roughly 140.
- Merging two books now needs real id-collision handling. The baseline
  sidestepped this because it only ever merged books it had produced itself.

**Neutral**

- EPUB 2 and EPUB 3 output are both preserved, with the NCX generated from
  the same nav model as the EPUB 3 nav document, so the two cannot diverge.
- `zip.js` and DOMPurify remain the only two runtime dependencies.
