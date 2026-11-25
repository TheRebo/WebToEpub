/**
 * The EPUB writer.
 *
 * Serialises an {@link EpubDocument} into the files that make up an EPUB 3
 * container, with an EPUB 2-compatible NCX for readers that still want one.
 *
 * The writer never touches XML with a regular expression. Everything is
 * generated from the document model, so the output is always well-formed.
 *
 * See ADR-0008.
 */
import {
    CONTAINER_PATH,
    CSS_PATH,
    MIMETYPE_CONTENT,
    MIMETYPE_PATH,
    NAV_PATH,
    NCX_PATH,
    OPF_PATH,
    type EpubDocument,
    type EpubFile,
    type NavigationPoint,
    escapeXml,
    escapeXmlAttribute,
    mediaTypeForPath,
    opfVersionAttribute,
    XHTML_MEDIA_TYPE,
} from "./document";

/** The stylesheet every generated EPUB carries. */
export const DEFAULT_CSS = `@charset "utf-8";
body {
    margin: 0 5%;
    line-height: 1.6;
    font-family: serif;
}
h1, h2, h3, h4 {
    line-height: 1.3;
    margin: 1.2em 0 0.6em;
    page-break-after: avoid;
}
h1 {
    font-size: 1.6em;
    margin-top: 1em;
}
p {
    margin: 0 0 0.9em;
    text-indent: 1.2em;
}
p.first, h1 + p, h2 + p, h3 + p {
    text-indent: 0;
}
blockquote {
    margin: 1em 2em;
    font-style: italic;
}
img {
    max-width: 100%;
    height: auto;
}
hr {
    margin: 2em auto;
    width: 30%;
}
.chapter-number {
    display: block;
    font-size: 0.85em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 0.4em;
}
.author-note, .footnote {
    font-size: 0.9em;
    color: #444;
    border-left: 3px solid #ccc;
    padding-left: 0.8em;
}
nav#toc ol {
    list-style-type: none;
    padding-left: 1em;
}
nav#toc > ol {
    padding-left: 0;
}
`;

/** The container document. */
export function buildContainerXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="${escapeXmlAttribute(OPF_PATH)}" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>
`;
}

/** The package document. */
export function buildPackageXml(document: EpubDocument): string {
    const { metadata, manifest, spine } = document.package;
    const uniqueIdentifier = document.package.uniqueIdentifier;

    // The creator's role is expressed differently in the two versions. EPUB 2
    // uses an `opf:role` attribute, which EPUB 3's schema does not allow at
    // all; EPUB 3 refines the creator with a `meta` element instead.
    const isEpub3 = document.version === 3;
    const creators = metadata.creators
        .map((creator, index) => {
            const id = `creator-${index + 1}`;
            const role = isEpub3
                ? `<dc:creator id="${escapeXmlAttribute(id)}">${escapeXml(creator)}</dc:creator>`
                : `<dc:creator opf:role="aut">${escapeXml(creator)}</dc:creator>`;
            return role;
        })
        .join("\n");

    // The refinement that gives the creator its role in an EPUB 3 book.
    const creatorRoles = isEpub3
        ? metadata.creators
              .map(
                  (_, index) =>
                      `    <meta refines="#creator-${index + 1}" property="role" scheme="marc:relators">aut</meta>`,
              )
              .join("\n")
        : "";

    const subjects = metadata.subjects
        .map((subject) => `    <dc:subject>${escapeXml(subject)}</dc:subject>`)
        .join("\n");

    const manifestXml = manifest
        .map((item) => {
            // The `properties` attribute is an EPUB 3 addition. EPUB 2's
            // schema has no such attribute, and a validator rejects the
            // package document outright when it finds one.
            const properties =
                isEpub3 && item.properties
                    ? ` properties="${escapeXmlAttribute(item.properties)}"`
                    : "";
            return `    <item id="${escapeXmlAttribute(item.id)}" href="${escapeXmlAttribute(item.href)}" media-type="${escapeXmlAttribute(item.mediaType)}"${properties}/>`;
        })
        .join("\n");

    const spineXml = spine
        .map((item) => {
            const linear = item.linear === false ? ' linear="no"' : "";
            return `    <itemref idref="${escapeXmlAttribute(item.idRef)}"${linear}/>`;
        })
        .join("\n");

    // The spine names the NCX. EPUB 3 deprecated the attribute in favour of
    // the navigation document, but the specification still requires it for a
    // book that carries an NCX, and a validator rejects the book without it.
    const tocAttribute = document.package.tocId
        ? ` toc="${escapeXmlAttribute(document.package.tocId)}"`
        : "";

    const coverMeta = metadata.coverId
        ? `    <meta name="cover" content="${escapeXmlAttribute(metadata.coverId)}"/>\n`
        : "";

    const publisher = metadata.publisher
        ? `    <dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>\n`
        : "";
    const description = metadata.description
        ? `    <dc:description>${escapeXml(metadata.description)}</dc:description>\n`
        : "";
    const date = metadata.date ? `    <dc:date>${escapeXml(metadata.date)}</dc:date>\n` : "";

    // The modification date is required in an EPUB 3 book, exactly once. It
    // records when the book was generated, which is what a reader's library
    // uses to decide whether an update has happened.
    const modified = isEpub3
        ? `    <meta property="dcterms:modified">${escapeXml(metadata.modified ?? "")}</meta>\n`
        : "";

    // EPUB 2's package element has no `xml:lang` attribute: the language is
    // carried by the `dc:language` element alone.
    const languageAttribute = isEpub3 ? ` xml:lang="${escapeXmlAttribute(metadata.language)}"` : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${opfVersionAttribute(document.version)}" unique-identifier="${escapeXmlAttribute(uniqueIdentifier)}"${languageAttribute}>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="${escapeXmlAttribute(uniqueIdentifier)}">${escapeXml(metadata.identifier)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:language>${escapeXml(metadata.language)}</dc:language>
${creators}${creatorRoles ? `${creatorRoles}\n` : ""}${publisher}${description}${subjects}${date}${modified}${coverMeta}  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine${tocAttribute}>
${spineXml}
  </spine>
</package>
`;
}

/** The NCX document, for EPUB 2 readers. */
export function buildNcxXml(document: EpubDocument): string {
    const points = document.toc.map((point, index) => buildNcxPoint(point, index + 1)).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXmlAttribute(document.package.metadata.identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(document.package.metadata.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

/** One navigation point in the NCX. */
function buildNcxPoint(point: NavigationPoint, id: number): string {
    const children =
        point.children.length > 0
            ? `\n${point.children.map((child, index) => buildNcxPoint(child, id * 100 + index + 1)).join("\n")}`
            : "";
    return `    <navPoint id="navPoint-${id}" playOrder="${id}">
      <navLabel><text>${escapeXml(point.label)}</text></navLabel>
      <content src="${escapeXmlAttribute(point.src)}"/>${children}
    </navPoint>`;
}

/**
 * The EPUB 3 navigation document.
 *
 * @param document The EPUB document.
 * @param stylesheet The relative reference to the stylesheet. The navigation
 *   document sits in the same directory as the stylesheet, so it links it by
 *   name.
 */
export function buildNavXml(document: EpubDocument, stylesheet = "styles.css"): string {
    const listItems = document.toc
        .map((point) => {
            const children =
                point.children.length > 0
                    ? `\n${point.children.map((child) => `      <li><a href="${escapeXmlAttribute(child.src)}">${escapeXml(child.label)}</a></li>`).join("\n")}`
                    : "";
            return `    <li><a href="${escapeXmlAttribute(point.src)}">${escapeXml(point.label)}</a>${children ? `\n${children}` : ""}</li>`;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(document.package.metadata.language)}">
  <head>
    <title>${escapeXml(document.package.metadata.title)}</title>
    <meta charset="utf-8"/>
    <link rel="stylesheet" type="text/css" href="${escapeXmlAttribute(stylesheet)}"/>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of contents</h1>
      <ol>
${listItems}
      </ol>
    </nav>
  </body>
</html>
`;
}

/**
 * Wrap a body fragment in a complete XHTML document.
 *
 * The two EPUB versions want different dialects of XHTML, and a reader that
 * validates its input refuses a book that mixes them. EPUB 3 uses XHTML 5,
 * with the `<!DOCTYPE html>` declaration and a `<meta charset>` element.
 * EPUB 2 uses XHTML 1.1, which has neither: it wants the XHTML 1.1 public
 * doctype, and it wants the character set declared with an `http-equiv`
 * `<meta>` element instead.
 *
 * @param title The document's title.
 * @param bodyHtml The body's markup.
 * @param language The document's language.
 * @param stylesheet The relative reference to the stylesheet. It has to be
 *   relative to the file being written, so a chapter in `OEBPS/text` links
 *   `../styles.css` while the navigation document links `styles.css`.
 * @param version The EPUB version the document is written for.
 */
export function buildXhtml(
    title: string,
    bodyHtml: string,
    language = "en",
    stylesheet = "styles.css",
    version: 2 | 3 = 3,
): string {
    if (version === 2) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXmlAttribute(language)}">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="${escapeXmlAttribute(stylesheet)}"/>
  </head>
  <body>
${bodyHtml}
  </body>
</html>
`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(language)}" lang="${escapeXmlAttribute(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="${escapeXmlAttribute(stylesheet)}"/>
  </head>
  <body>
${bodyHtml}
  </body>
</html>
`;
}

/** The files an EPUB document consists of. */
export function collectFiles(document: EpubDocument): EpubFile[] {
    const files: EpubFile[] = [];

    // The `mimetype` file comes first, because the OCF specification requires
    // it to be the very first entry in the archive, stored uncompressed, so
    // that a reader can identify the file format from the first few bytes
    // without unpacking it.
    files.push({
        path: MIMETYPE_PATH,
        content: MIMETYPE_CONTENT,
        mediaType: MIMETYPE_CONTENT,
    });

    files.push({
        path: CONTAINER_PATH,
        content: buildContainerXml(),
        mediaType: "application/xml",
    });
    files.push({
        path: OPF_PATH,
        content: buildPackageXml(document),
        mediaType: "application/oebps-package+xml",
    });

    if (document.version === 3) {
        files.push({
            path: NAV_PATH,
            content: buildNavXml(document),
            mediaType: XHTML_MEDIA_TYPE,
        });
    }

    // The NCX is written for both versions: EPUB 3 readers ignore it, and
    // EPUB 2 readers need it.
    files.push({
        path: NCX_PATH,
        content: buildNcxXml(document),
        mediaType: "application/x-dtbncx+xml",
    });

    if (!document.files.has(CSS_PATH)) {
        files.push({ path: CSS_PATH, content: DEFAULT_CSS, mediaType: "text/css" });
    }

    for (const file of document.files.values()) {
        files.push(file);
    }

    return files;
}

/** A unique manifest item ID. */
export function makeItemId(index: number, href: string): string {
    const name = href
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 24);
    return `item-${index}-${name || "file"}`;
}

/** The media type for a file path. */
export { mediaTypeForPath };
