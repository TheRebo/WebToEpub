/**
 * The EPUB packer.
 *
 * Turns a set of chapters into a complete, valid EPUB.
 *
 * The baseline had a defect the discovery audit rated high severity: when an
 * image failed to download, it was packed as a **zero-byte file**, which
 * corrupts the EPUB for every reader that validates the archive. Here a
 * failed image becomes a visible placeholder, and the EPUB stays valid.
 *
 * See ADR-0008.
 */
import {
    type EpubDocument,
    type ManifestItem,
    type Metadata,
    type NavigationPoint,
    type SpineItem,
    CSS_PATH,
    mediaTypeForPath,
} from "./document";
import { buildXhtml, collectFiles, makeItemId } from "./writer";
import { serializeAsXml } from "./xhtml";
import { rewriteImageElements } from "../util/image-references";
import { redactUrl } from "../util/url";
import { stripIllegalXmlCharacters } from "../util/xml-characters";

/**
 * Rewrite a chapter's image references to the packaged copies.
 *
 * The download manager rewrites the references before it hands the chapter
 * over, but the packer cannot rely on that: a book whose chapters still point
 * at the site's own servers looks fine in the file list and shows broken
 * pictures in the reader. Rewriting here as well makes the packer correct on
 * its own, and the rewrite is idempotent — a reference that already points at
 * a packaged image does not resolve to a remote URL, so it is left alone.
 *
 * The result is serialised as XML on the way out, because the chapter is
 * written as XHTML: HTML's serialiser leaves `<br>` and `<img>` unclosed,
 * which is not well-formed XML.
 *
 * @param html The chapter's markup.
 * @param images The chapter's images, keyed by their URL.
 * @param baseUrl The chapter's URL, used to resolve relative references.
 * @returns The markup, with its references rewritten, as XML.
 */
function rewriteImageHrefs(html: string, images: Map<string, ImageData>, baseUrl: string): string {
    // A chapter with no image markup at all cannot hold a stray reference, and
    // parsing every chapter of a long book to find that out is work worth
    // avoiding.
    if (!/<(?:img|source)\b/i.test(html)) return html;

    const document = new DOMParser().parseFromString(html, "text/html");
    const changed = rewriteImageElements(document, images, baseUrl, (image) =>
        chapterImageHref(image.url, image.mediaType),
    );

    if (!changed) return html;
    return serializeAsXml(document.body);
}

/**
 * Turn a chapter's HTML into XHTML.
/** A chapter, ready to be packed. */
export interface ChapterToPack {
    /** The chapter's URL. */
    sourceUrl: string;
    /** The chapter's title. */
    title: string;
    /** The chapter's body, as sanitised HTML. */
    contentHtml: string;
    /** Images referenced by the chapter, keyed by their URL. */
    images?: Map<string, ImageData>;
    /** Whether the chapter is a real chapter or a placeholder. */
    isPlaceholder?: boolean;
}

/** An image, and its bytes. */
export interface ImageData {
    /** The image's bytes. */
    data: Uint8Array;
    /** The media type. */
    mediaType: string;
    /** The original URL. */
    url: string;
}

/** The metadata the packer needs. */
export interface PackMetadata {
    /** The title. */
    title: string;
    /** The author. */
    author?: string;
    /** The language, as an ISO 639 code. */
    language?: string;
    /** The publisher. */
    publisher?: string;
    /** The description. */
    description?: string;
    /** The subjects. */
    subjects?: string[];
    /** The publication date. */
    date?: string;
    /**
     * The date the book was last modified.
     *
     * Defaults to the moment the book is packed. EPUB 3 requires a
     * `dcterms:modified` element, so a book always has one.
     */
    modified?: string;
    /** The cover image. */
    cover?: ImageData;
    /** The EPUB version. */
    version?: 2 | 3;
    /** Whether to include an information page. */
    includeInfoPage?: boolean;
}

/** The result of packing. */
export interface PackResult {
    /** The document. */
    document: EpubDocument;
    /** The files, ready to be zipped. */
    files: ReturnType<typeof collectFiles>;
    /** The cover path within the container. */
    coverPath?: string;
}

/** The directory the packaged images live in, inside the container. */
export const IMAGES_DIRECTORY = "OEBPS/images";

/**
 * The relative reference a chapter file uses for a packaged image.
 *
 * Chapter files live in `OEBPS/text`, so the images directory is one level
 * up. Getting this wrong produces an EPUB whose pictures are all broken, so
 * the reference is computed in one place and used by both the packer and the
 * download manager.
 */
export function chapterImageHref(url: string, mediaType: string): string {
    return `../images/${imageFileName(url, mediaType)}`;
}

/**
 * The path a packaged image occupies inside the container.
 */
export function imagePath(url: string, mediaType: string): string {
    return `${IMAGES_DIRECTORY}/${imageFileName(url, mediaType)}`;
}

/**
 * The file name of a packaged image.
 *
 * The name is derived from the URL, so the same image always lands on the
 * same file, and two images with the same base name on different sites do
 * not collide. The `img-` prefix keeps a chapter image away from the cover,
 * which is written to `cover.<ext>`.
 */
export function imageFileName(url: string, mediaType: string): string {
    return `img-${imageBaseName(url)}-${hashOf(url)}.${extensionFor(mediaType)}`;
}

/**
 * A readable stem for an image's file name.
 *
 * The URL's last path segment is the closest thing the image has to a name.
 * It is stripped of its extension and of anything that would be awkward in a
 * file name.
 */
function imageBaseName(url: string): string {
    let path = url;
    try {
        path = new URL(url).pathname;
    } catch {
        // A relative or malformed URL still has a usable tail.
    }
    const last = path.split("/").pop() ?? "";
    const stem = last.replace(/\.[^.]*$/, "");
    const safe = stem
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);
    return safe || "image";
}

/**
 * A short, stable hash of a string.
 *
 * Two different images on the same site often share a file name — `cover.jpg`
 * is common — so the name alone is not enough to keep them apart.
 */
function hashOf(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; ++index) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** The path of a chapter file within the container. */
function chapterPath(index: number): string {
    return `OEBPS/text/chapter-${String(index + 1).padStart(4, "0")}.xhtml`;
}

/** The path of the information page within the container. */
const INFO_PATH = "OEBPS/text/info.xhtml";

/**
 * The relative reference a file uses to link the stylesheet.
 *
 * The stylesheet lives at `OEBPS/styles.css`, but the files that link it live
 * in different directories: the chapters are in `OEBPS/text`, one level down.
 * A relative reference is resolved against the linking file, so a chapter that
 * said `styles.css` would look for `OEBPS/text/styles.css` and find nothing —
 * every chapter in every book would render unstyled.
 *
 * @param filePath The path of the file that will link the stylesheet.
 * @returns The href to use.
 */
export function stylesheetHref(filePath: string): string {
    const fileDirectory = filePath.split("/").slice(0, -1);
    const cssDirectory = CSS_PATH.split("/").slice(0, -1);

    // The number of directories the file has to climb to reach the root of
    // the container, which is where the stylesheet's directory sits.
    const climbs = fileDirectory.length - cssDirectory.length;
    if (climbs <= 0) {
        // The file is in the stylesheet's directory or above it, so the
        // reference is a plain sibling name.
        return CSS_PATH.split("/").pop() ?? "styles.css";
    }
    return `${"../".repeat(climbs)}${CSS_PATH.split("/").pop()}`;
}

/**
 * Pack chapters into an EPUB document.
 */
export function packEpub(chapters: ChapterToPack[], metadata: PackMetadata): PackResult {
    const version = metadata.version ?? 3;
    // An empty language is as bad as none: a reader cannot guess it.
    const language = metadata.language?.trim() || "en";

    const manifest: ManifestItem[] = [];
    const spine: SpineItem[] = [];
    const toc: NavigationPoint[] = [];
    const files = new Map<
        string,
        { path: string; content: string | Uint8Array; mediaType: string }
    >();

    let itemIndex = 0;
    const nextId = (href: string): string => makeItemId(itemIndex++, href);

    // The stylesheet.
    const cssId = nextId(CSS_PATH);
    manifest.push({ id: cssId, href: "styles.css", mediaType: "text/css" });

    // The cover.
    let coverPath: string | undefined;
    if (metadata.cover && metadata.cover.data.length > 0) {
        const mediaType = metadata.cover.mediaType || "application/octet-stream";
        coverPath = `OEBPS/images/cover.${extensionFor(mediaType)}`;
        files.set(coverPath, {
            path: coverPath,
            content: metadata.cover.data,
            mediaType,
        });
        manifest.push({
            id: nextId(coverPath),
            href: coverPath.replace(/^OEBPS\//, ""),
            mediaType,
            properties: "cover-image",
        });
    }

    // The chapters.
    for (const [index, chapter] of chapters.entries()) {
        const path = chapterPath(index);

        // The references are rewritten here, so that the chapter points at the
        // packaged image rather than at the site's own servers. A caller that
        // already rewrote them is not disturbed, and a chapter with no images
        // at all still has its stray references removed.
        const contentHtml = rewriteImageHrefs(
            chapter.contentHtml,
            chapter.images ?? new Map<string, ImageData>(),
            chapter.sourceUrl,
        );

        const body = buildChapterBody({ ...chapter, contentHtml }, metadata.author);

        // The chapter's images are packaged alongside it, and the chapter's
        // markup points at them. The manifest entries are added here, before
        // the chapter file is written, because the reference and the manifest
        // have to agree.
        packageChapterImages(chapter, files, manifest, nextId);

        files.set(path, {
            path,
            content: buildXhtml(chapter.title, body, language, stylesheetHref(path), version),
            mediaType: "application/xhtml+xml",
        });

        const id = nextId(path);
        manifest.push({
            id,
            href: path.replace(/^OEBPS\//, ""),
            mediaType: "application/xhtml+xml",
        });
        spine.push({ idRef: id });

        toc.push({
            label: chapter.title,
            src: path.replace(/^OEBPS\//, ""),
            children: [],
        });
    }

    // The information page.
    //
    // It goes at the *front* of the book, in the spine as well as in the
    // table of contents. The navigation document has to list its links in
    // reading order, so a page that is first in the table of contents but
    // last in the spine is a book a validator rejects.
    if (metadata.includeInfoPage) {
        const path = INFO_PATH;
        files.set(path, {
            path,
            content: buildXhtml(
                "About this book",
                buildInfoPage(metadata),
                language,
                stylesheetHref(path),
                version,
            ),
            mediaType: "application/xhtml+xml",
        });
        const id = nextId(path);
        manifest.push({ id, href: "text/info.xhtml", mediaType: "application/xhtml+xml" });
        spine.unshift({ idRef: id });
        toc.unshift({ label: "About this book", src: "text/info.xhtml", children: [] });
    }

    // The navigation document, for EPUB 3.
    if (version === 3) {
        manifest.push({
            id: nextId("nav.xhtml"),
            href: "nav.xhtml",
            mediaType: "application/xhtml+xml",
            properties: "nav",
        });
    }

    // The NCX, for EPUB 2 readers.
    const ncxId = nextId("toc.ncx");
    manifest.push({
        id: ncxId,
        href: "toc.ncx",
        mediaType: "application/x-dtbncx+xml",
    });

    const packageMetadata: Metadata = {
        title: metadata.title,
        creators: metadata.author ? [metadata.author] : [],
        language,
        publisher: metadata.publisher,
        description: metadata.description,
        subjects: metadata.subjects ?? [],
        date: metadata.date,
        identifier: `urn:uuid:${crypto.randomUUID()}`,
        // The date the book was generated. EPUB 3 requires it, and a reader's
        // library uses it to tell an update from a re-download.
        modified: metadata.modified ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        coverId: coverPath
            ? manifest.find((item) => item.properties?.includes("cover-image"))?.id
            : undefined,
    };

    const document: EpubDocument = {
        package: {
            uniqueIdentifier: "id",
            version,
            metadata: packageMetadata,
            manifest,
            spine,
            tocId: ncxId,
        },
        files,
        toc,
        version,
    };

    return { document, files: collectFiles(document), coverPath };
}

/**
 * Package a chapter's images and register them in the manifest.
 *
 * Each image becomes a file in `OEBPS/images`, and each becomes a manifest
 * item, so a reader can find it. An image that is already in the container —
 * because another chapter used it — is not written twice, and does not get a
 * second manifest entry.
 *
 * @param chapter The chapter whose images to package.
 * @param files The container's files.
 * @param manifest The manifest to add to.
 * @param nextId Hands out the manifest item IDs.
 */
function packageChapterImages(
    chapter: ChapterToPack,
    files: Map<string, { path: string; content: string | Uint8Array; mediaType: string }>,
    manifest: ManifestItem[],
    nextId: (href: string) => string,
): void {
    if (!chapter.images) return;

    for (const [url, image] of chapter.images) {
        // An image with no bytes is a placeholder that was never filled in.
        // There is nothing to write, and a zero-byte file would corrupt the
        // EPUB.
        if (image.data.length === 0) continue;

        // The image's own URL, rather than the key it happens to be filed under.
        // When the same picture is served from two URLs, the second one is
        // pointed at the first, and the key is then the *second* URL while the
        // image still knows the first. Naming the file after the key would
        // write the picture into the book a second time, which is exactly what
        // the setting that asked for it is meant to prevent.
        const canonical = image.url || url;

        const path = imagePath(canonical, image.mediaType);
        if (!files.has(path)) {
            // A media type is never left empty. The manifest has to name one
            // for every file it lists, and an entry with no media type is one
            // every reader rejects.
            const mediaType = image.mediaType || "application/octet-stream";
            files.set(path, {
                path,
                content: image.data,
                mediaType,
            });
            manifest.push({
                id: nextId(path),
                href: path.replace(/^OEBPS\//, ""),
                mediaType,
            });
        }
    }
}

/** The body of a chapter. */
function buildChapterBody(chapter: ChapterToPack, author?: string): string {
    const parts: string[] = [];

    if (author) {
        parts.push(`    <p class="chapter-author">${escapeText(author)}</p>`);
    }

    // A parser that puts the chapter's own title into the content has already
    // written it. Adding it again would show the reader the same heading
    // twice, which is the sort of small wrongness that makes a generated
    // book feel machine-made.
    if (!startsWithHeading(chapter.contentHtml)) {
        parts.push(`    <h1>${escapeText(chapter.title)}</h1>`);
    }
    parts.push(toXhtml(chapter.contentHtml));

    return parts.join("\n");
}

/**
 * Turn a chapter's HTML into XHTML.
 *
 * The chapter is written into the book as XHTML, which is XML: an element
 * without content has to be closed, and the characters XML reserves have to
 * be escaped. HTML's serialiser does neither, so a chapter with a line break
 * or a horizontal rule would produce a file that is not well-formed XML, and
 * a reader that checks would refuse the whole book.
 *
 * @param html The chapter's markup.
 * @returns The markup, as XHTML.
 */
function toXhtml(html: string): string {
    if (!html.trim()) return "";

    const document = new DOMParser().parseFromString(html, "text/html");
    repairIds(document.body);
    return serializeAsXml(document.body);
}

/**
 * Whether the content already opens with a heading.
 *
 * The legacy cleanup pipeline inserts the chapter title as an `<h1>` when the
 * page did not already carry it, so this check keeps the two paths from
 * overlapping.
 */
function startsWithHeading(contentHtml: string): boolean {
    return /^\s*<h[1-6][\s>]/i.test(contentHtml);
}

/** The body of the information page. */
function buildInfoPage(metadata: PackMetadata): string {
    const parts: string[] = [];
    parts.push("    <h1>About this book</h1>");
    if (metadata.author) {
        parts.push(`    <p><strong>Author:</strong> ${escapeText(metadata.author)}</p>`);
    }
    if (metadata.publisher) {
        parts.push(`    <p><strong>Publisher:</strong> ${escapeText(metadata.publisher)}</p>`);
    }
    if (metadata.date) {
        parts.push(`    <p><strong>Published:</strong> ${escapeText(metadata.date)}</p>`);
    }
    if (metadata.description) {
        parts.push(`    <p>${escapeText(metadata.description)}</p>`);
    }
    return parts.join("\n");
}

/**
 * The placeholder for a chapter that could not be loaded.
 *
 * The baseline packed an empty chapter with no explanation; the reader saw a
 * blank page. A placeholder says what happened.
 *
 * The chapter's address is written into the book without its query string.
 * A site's query string can carry a session token or a signed parameter, and
 * a book is a file the user sends to other people — a secret that travels
 * with it is a secret that leaks. The path is enough to say which chapter it
 * was.
 */
export function buildPlaceholderChapter(url: string, reason: string): ChapterToPack {
    const safeUrl = redactUrl(url) ?? url;
    const body = `    <h1>Chapter unavailable</h1>
    <p class="placeholder">${escapeText(reason)}</p>
    <p class="placeholder"><a href="${escapeText(safeUrl)}">${escapeText(safeUrl)}</a></p>`;
    return {
        sourceUrl: url,
        title: "Chapter unavailable",
        contentHtml: body,
        isPlaceholder: true,
    };
}

/**
 * The placeholder for an image that could not be downloaded.
 *
 * The baseline packed a zero-byte file, which corrupts the EPUB. This is a
 * visible placeholder image instead: a small picture that says the image is
 * missing. The EPUB stays valid, and the reader can see what happened.
 *
 * The placeholder is a PNG rather than an SVG: a book that carries SVG files
 * is a book many readers cannot show, and the extension has a setting that
 * says so.
 *
 * See `epub/placeholder.ts`.
 */
export { buildPlaceholderImage } from "./placeholder";

/**
 * The file extension for a media type.
 *
 * Every media type the extension accepts has an extension here. A media type
 * with no extension of its own would be written into the book as a `.bin`
 * file, and a reader that is handed `image/avif` under the name `picture.bin`
 * shows nothing at all.
 *
 * @param mediaType The media type.
 * @returns The extension, without a dot.
 */
export function extensionFor(mediaType: string): string {
    switch (mediaType) {
        case "image/png":
            return "png";
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/gif":
            return "gif";
        case "image/webp":
            return "webp";
        case "image/svg+xml":
            return "svg";
        case "image/avif":
            return "avif";
        case "image/bmp":
            return "bmp";
        case "image/x-icon":
        case "image/vnd.microsoft.icon":
            return "ico";
        default:
            return "bin";
    }
}

/** Escape text for XML content. */
function escapeText(text: string): string {
    return stripIllegalXmlCharacters(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export { mediaTypeForPath };

/** An XML name, which is what an `id` in an XHTML file has to be. */
const XML_NAME = /^[\p{L}_][\p{L}\p{N}_.\-\u00B7]*$/u;

/**
 * Make every `id` in a chapter a valid, unique XML name.
 *
 * Web novel pages often number their paragraphs `id="1"`, and reuse an `id`
 * across a page. Both make the chapter invalid XHTML, which strict readers
 * and EPUBCheck reject. A bad `id` is rewritten, a duplicate is dropped, and
 * a link to the old `id` inside the chapter follows it.
 *
 * @param root The chapter's body.
 */
export function repairIds(root: Element): void {
    const renamed = new Map<string, string>();
    const seen = new Set<string>();
    for (const element of Array.from(root.querySelectorAll("[id]"))) {
        const id = element.getAttribute("id") ?? "";
        const next = XML_NAME.test(id) ? id : `id-${id.replace(/[^\p{L}\p{N}_.-]/gu, "_")}`;
        if (seen.has(next)) {
            element.removeAttribute("id");
            continue;
        }
        if (next !== id) {
            element.setAttribute("id", next);
            if (!renamed.has(id)) renamed.set(id, next);
        }
        seen.add(next);
    }
    if (renamed.size === 0) return;
    for (const link of Array.from(root.querySelectorAll("a[href^='#']"))) {
        const target = renamed.get((link.getAttribute("href") ?? "").slice(1));
        if (target) link.setAttribute("href", `#${target}`);
    }
}
