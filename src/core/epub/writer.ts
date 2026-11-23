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
    NAV_PATH,
    NCX_PATH,
    OPF_PATH,
    type EpubDocument,
    type EpubFile,
    type ManifestItem,
    type NavigationPoint,
    escapeXml,
    escapeXmlAttribute,
    mediaTypeForPath,
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

    const creators = metadata.creators
        .map(
            (creator) =>
                `    <dc:creator opf:role="aut">${escapeXml(creator)}</dc:creator>`,
        )
        .join("\n");

    const subjects = metadata.subjects
        .map((subject) => `    <dc:subject>${escapeXml(subject)}</dc:subject>`)
        .join("\n");

    const manifestXml = manifest
        .map((item) => {
            const properties = item.properties ? ` properties="${escapeXmlAttribute(item.properties)}"` : "";
            return `    <item id="${escapeXmlAttribute(item.id)}" href="${escapeXmlAttribute(item.href)}" media-type="${escapeXmlAttribute(item.mediaType)}"${properties}/>`;
        })
        .join("\n");

    const spineXml = spine
        .map((item) => {
            const linear = item.linear === false ? ' linear="no"' : "";
            return `    <itemref idref="${escapeXmlAttribute(item.idRef)}"${linear}/>`;
        })
        .join("\n");

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

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${document.version}" unique-identifier="${escapeXmlAttribute(uniqueIdentifier)}" xml:lang="${escapeXmlAttribute(metadata.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="${escapeXmlAttribute(uniqueIdentifier)}">${escapeXml(metadata.identifier)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:language>${escapeXml(metadata.language)}</dc:language>
${creators}${publisher}${description}${subjects}${date}${coverMeta}  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine>
${spineXml}
  </spine>
</package>
`;
}

/** The NCX document, for EPUB 2 readers. */
export function buildNcxXml(document: EpubDocument): string {
    const points = document.toc
        .map((point, index) => buildNcxPoint(point, index + 1))
        .join("\n");

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

/** The EPUB 3 navigation document. */
export function buildNavXml(document: EpubDocument): string {
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

/** Wrap a body fragment in a complete XHTML document. */
export function buildXhtml(title: string, bodyHtml: string, language = "en"): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(language)}" lang="${escapeXmlAttribute(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
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
