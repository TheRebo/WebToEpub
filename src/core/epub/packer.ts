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

/** The path of a chapter file within the container. */
function chapterPath(index: number): string {
    return `OEBPS/text/chapter-${String(index + 1).padStart(4, "0")}.xhtml`;
}

/**
 * Pack chapters into an EPUB document.
 */
export function packEpub(chapters: ChapterToPack[], metadata: PackMetadata): PackResult {
    const version = metadata.version ?? 3;
    const language = metadata.language ?? "en";

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
        coverPath = `OEBPS/images/cover.${extensionFor(metadata.cover.mediaType)}`;
        files.set(coverPath, {
            path: coverPath,
            content: metadata.cover.data,
            mediaType: metadata.cover.mediaType,
        });
        manifest.push({
            id: nextId(coverPath),
            href: coverPath.replace(/^OEBPS\//, ""),
            mediaType: metadata.cover.mediaType,
            properties: "cover-image",
        });
    }

    // The chapters.
    for (const [index, chapter] of chapters.entries()) {
        const path = chapterPath(index);
        const body = buildChapterBody(chapter, metadata.author);
        files.set(path, {
            path,
            content: buildXhtml(chapter.title, body, language),
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
    if (metadata.includeInfoPage) {
        const path = "OEBPS/text/info.xhtml";
        files.set(path, {
            path,
            content: buildXhtml("About this book", buildInfoPage(metadata), language),
            mediaType: "application/xhtml+xml",
        });
        const id = nextId(path);
        manifest.push({ id, href: "text/info.xhtml", mediaType: "application/xhtml+xml" });
        spine.push({ idRef: id });
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
    manifest.push({
        id: nextId("toc.ncx"),
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
        },
        files,
        toc,
        version,
    };

    return { document, files: collectFiles(document), coverPath };
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
    parts.push(chapter.contentHtml);

    return parts.join("\n");
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
 */
export function buildPlaceholderChapter(url: string, reason: string): ChapterToPack {
    const body = `    <h1>Chapter unavailable</h1>
    <p class="placeholder">${escapeText(reason)}</p>
    <p class="placeholder"><a href="${escapeText(url)}">${escapeText(url)}</a></p>`;
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
 * visible placeholder image instead: a small SVG that says the image is
 * missing. The EPUB stays valid, and the reader can see what happened.
 */
export function buildPlaceholderImage(url: string): ImageData {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="Image unavailable">
  <rect width="400" height="300" fill="#f2efe8" stroke="#cfc8b9" stroke-width="2"/>
  <path d="M120 190 L170 130 L210 175 L250 125 L290 190 Z" fill="#e5e0d5" stroke="#a69e8d" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="145" cy="105" r="14" fill="none" stroke="#a69e8d" stroke-width="2"/>
  <text x="200" y="225" font-family="sans-serif" font-size="14" fill="#7c7466" text-anchor="middle">Image unavailable</text>
  <text x="200" y="248" font-family="sans-serif" font-size="11" fill="#a69e8d" text-anchor="middle">${escapeText(url.slice(0, 60))}</text>
</svg>`;
    return {
        data: new TextEncoder().encode(svg),
        mediaType: "image/svg+xml",
        url,
    };
}

/** The file extension for a media type. */
export function extensionFor(mediaType: string): string {
    switch (mediaType) {
        case "image/png":
            return "png";
        case "image/jpeg":
            return "jpg";
        case "image/gif":
            return "gif";
        case "image/webp":
            return "webp";
        case "image/svg+xml":
            return "svg";
        default:
            return "bin";
    }
}

/** Escape text for XML content. */
function escapeText(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export { mediaTypeForPath };
