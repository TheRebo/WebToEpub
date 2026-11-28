/**
 * The EPUB document model.
 *
 * The baseline merged books with regular expressions applied directly to the
 * OPF and NCX XML, which silently corrupts any EPUB not produced by its
 * exact serialiser. The rewrite models an EPUB as a document and rewrites it
 * structurally.
 *
 * See ADR-0008.
 */
import { stripIllegalXmlCharacters } from "../util/xml-characters";

/** A file inside the EPUB container. */
export interface EpubFile {
    /** The path within the container, e.g. `OEBPS/chapter1.xhtml`. */
    path: string;
    /** The file's content. */
    content: string | Uint8Array;
    /** The media type. */
    mediaType: string;
}

/** An item in the OPF manifest. */
export interface ManifestItem {
    /** The item's ID. */
    id: string;
    /** The href, relative to the OPF's directory. */
    href: string;
    /** The media type. */
    mediaType: string;
    /** The item's properties, e.g. `nav`, `cover-image`, `scripted`. */
    properties?: string;
}

/** A spine reference. */
export interface SpineItem {
    /** The manifest item's ID. */
    idRef: string;
    /** Whether the item is linear. */
    linear?: boolean;
}

/** The EPUB package document. */
export interface PackageDocument {
    /** The package's unique identifier. */
    uniqueIdentifier: string;
    /** The EPUB version: 2 or 3. */
    version: 2 | 3;
    /** The metadata. */
    metadata: Metadata;
    /** The manifest. */
    manifest: ManifestItem[];
    /** The spine. */
    spine: SpineItem[];
    /**
     * The manifest item's ID for the NCX.
     *
     * The spine's `toc` attribute has to name it. The attribute was deprecated
     * in EPUB 3, in favour of the navigation document, but the specification
     * still requires it whenever a book carries an NCX, and a validator
     * rejects the book without it.
     */
    tocId?: string;
}

/** The package metadata. */
export interface Metadata {
    /** The title. */
    title: string;
    /** The author, or authors. */
    creators: string[];
    /** The language, as an ISO 639 code. */
    language: string;
    /** The publisher. */
    publisher?: string;
    /** The description. */
    description?: string;
    /** The subject or subjects. */
    subjects: string[];
    /** The publication date, as an ISO 8601 string. */
    date?: string;
    /**
     * The date the book was last modified, as an ISO 8601 string.
     *
     * EPUB 3 requires a `dcterms:modified` element, and it must appear
     * exactly once.
     */
    modified?: string;
    /** The identifier. */
    identifier: string;
    /** The cover image's manifest item ID. */
    coverId?: string;
}

/** A navigation point in the NCX or the nav document. */
export interface NavigationPoint {
    /** The label. */
    label: string;
    /** The target, relative to the content directory. */
    src: string;
    /** Nested navigation points. */
    children: NavigationPoint[];
}

/** A complete EPUB. */
export interface EpubDocument {
    /** The package document. */
    package: PackageDocument;
    /** The content files, keyed by their path. */
    files: Map<string, EpubFile>;
    /** The table of contents. */
    toc: NavigationPoint[];
    /** The version. */
    version: 2 | 3;
}

/** The media type of an XHTML content file. */
export const XHTML_MEDIA_TYPE = "application/xhtml+xml";

/** The media type of a CSS file. */
export const CSS_MEDIA_TYPE = "text/css";

/** The media type of a PNG image. */
export const PNG_MEDIA_TYPE = "image/png";

/** The media type of a JPEG image. */
export const JPEG_MEDIA_TYPE = "image/jpeg";

/** The media type of a GIF image. */
export const GIF_MEDIA_TYPE = "image/gif";

/** The media type of a WebP image. */
export const WEBP_MEDIA_TYPE = "image/webp";

/** The media type of an SVG image. */
export const SVG_MEDIA_TYPE = "image/svg+xml";

/** The media type of an AVIF image. */
export const AVIF_MEDIA_TYPE = "image/avif";

/** The media type of a BMP image. */
export const BMP_MEDIA_TYPE = "image/bmp";

/** The media type of an ICO image. */
export const ICO_MEDIA_TYPE = "image/x-icon";

/** The media type of the NCX document. */
export const NCX_MEDIA_TYPE = "application/x-dtbncx+xml";

/** The media type of the navigation document. */
export const NAV_MEDIA_TYPE = "application/xhtml+xml";

/** The container path. */
export const CONTAINER_PATH = "META-INF/container.xml";

/**
 * The OCF `mimetype` file's path.
 *
 * The EPUB OCF specification requires every container to carry a `mimetype`
 * file at its root, holding `application/epub+zip`. It is not optional: a
 * reader that validates the container will refuse a book without it.
 */
export const MIMETYPE_PATH = "mimetype";

/**
 * The content of the OCF `mimetype` file.
 */
export const MIMETYPE_CONTENT = "application/epub+zip";

/** The OPF path used by the writer. */
export const OPF_PATH = "OEBPS/content.opf";

/** The NCX path used by the writer. */
export const NCX_PATH = "OEBPS/toc.ncx";

/** The navigation document path used by the writer. */
export const NAV_PATH = "OEBPS/nav.xhtml";

/** The stylesheet path used by the writer. */
export const CSS_PATH = "OEBPS/styles.css";

/** Guess the media type of a file from its extension. */
export function mediaTypeForPath(path: string): string {
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    switch (extension) {
        case "xhtml":
        case "html":
        case "htm":
            return XHTML_MEDIA_TYPE;
        case "css":
            return CSS_MEDIA_TYPE;
        case "png":
            return PNG_MEDIA_TYPE;
        case "jpg":
        case "jpeg":
            return JPEG_MEDIA_TYPE;
        case "gif":
            return GIF_MEDIA_TYPE;
        case "webp":
            return WEBP_MEDIA_TYPE;
        case "svg":
            return SVG_MEDIA_TYPE;
        case "avif":
            return AVIF_MEDIA_TYPE;
        case "bmp":
            return BMP_MEDIA_TYPE;
        case "ico":
            return ICO_MEDIA_TYPE;
        case "ncx":
            return NCX_MEDIA_TYPE;
        case "opf":
            return "application/oebps-package+xml";
        case "xml":
            return "application/xml";
        default:
            return "application/octet-stream";
    }
}

/** The version attribute of the package element, as the specification writes it. */
export function opfVersionAttribute(version: 2 | 3): "2.0" | "3.0" {
    return version === 2 ? "2.0" : "3.0";
}

/**
 * Read the version attribute of a package element.
 *
 * The specification writes the version as `2.0` or `3.0`, but a bare `2` or
 * `3` is seen in the wild, and the baseline wrote the bare form. Both are
 * accepted here so that a book produced by an older version of the extension,
 * or by another tool, is read the way its author meant it.
 *
 * @param value The attribute's value.
 * @returns The version.
 */
export function parseOpfVersion(value: string | null): 2 | 3 {
    return value?.trim().startsWith("2") ? 2 : 3;
}

/**
 * Escape a string for inclusion in XML text content.
 *
 * Characters XML forbids are removed first: a title or an author name from a
 * site can carry a control character, and one of them makes the whole book
 * malformed (ADR-0038).
 */
export function escapeXml(text: string): string {
    return stripIllegalXmlCharacters(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** Escape a string for inclusion in an XML attribute value. */
export function escapeXmlAttribute(text: string): string {
    return escapeXml(text).replace(/\n/g, "&#10;");
}
