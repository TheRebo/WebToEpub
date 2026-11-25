/**
 * The EPUB reader.
 *
 * Parses an EPUB container into an {@link EpubDocument} so it can be
 * inspected, merged, or re-serialised.
 *
 * This replaces the baseline's regex surgery on the OPF and NCX, which
 * corrupted any EPUB not produced by its exact serialiser. Here the XML is
 * parsed with `DOMParser`, so the structure is understood rather than
 * pattern-matched.
 *
 * See ADR-0008.
 */
import {
    CONTAINER_PATH,
    type EpubDocument,
    type EpubFile,
    type ManifestItem,
    type Metadata,
    type NavigationPoint,
    type PackageDocument,
    parseOpfVersion,
    type SpineItem,
} from "./document";

/** A parsed XML document, with a helper for namespace-agnostic queries. */
type XmlDocument = Document;

/** Parse XML, throwing if it is not well-formed. */
function parseXml(text: string, label: string): XmlDocument {
    const parser = new DOMParser();
    const dom = parser.parseFromString(text, "application/xml");
    const error = dom.querySelector("parsererror");
    if (error) {
        throw new Error(
            `Malformed XML in ${label}: ${error.textContent?.trim() ?? "unknown error"}`,
        );
    }
    return dom;
}

/** The first element matching any of the local names, namespace-agnostic. */
function findByLocalName(root: Element | Document, localName: string): Element | null {
    const direct = root.getElementsByTagName("*");
    for (const element of Array.from(direct)) {
        if (element.localName === localName) return element;
    }
    return null;
}

/** Every element matching a local name, namespace-agnostic. */
function findAllByLocalName(root: Element | Document, localName: string): Element[] {
    const result: Element[] = [];
    for (const element of Array.from(root.getElementsByTagName("*"))) {
        if (element.localName === localName) result.push(element);
    }
    return result;
}

/** The text of the first element matching a local name. */
function textOf(root: Element | Document, localName: string): string | undefined {
    const element = findByLocalName(root, localName);
    const text = element?.textContent?.trim();
    return text ? text : undefined;
}

/**
 * The result of reading an EPUB.
 */
export interface ReadEpubResult {
    /** The parsed document. */
    document: EpubDocument;
    /** Every file in the container. */
    files: Map<string, EpubFile>;
}

/**
 * Read an EPUB from its raw bytes.
 *
 * @param data The EPUB's bytes.
 * @param unzip The unzip function. Defaults to the `zip.js` implementation.
 */
export async function readEpub(
    data: ArrayBuffer | Uint8Array,
    unzip: UnzipFunction = unzipWithZipJs,
): Promise<ReadEpubResult> {
    const files = await unzip(data);
    return readEpubFromFiles(files);
}

/**
 * Read an EPUB from an already-unzipped file map.
 */
export function readEpubFromFiles(files: Map<string, EpubFile>): ReadEpubResult {
    const containerFile = files.get(CONTAINER_PATH);
    if (!containerFile) {
        throw new Error("Not an EPUB: META-INF/container.xml is missing.");
    }

    const containerXml = toText(containerFile.content);
    const containerDom = parseXml(containerXml, CONTAINER_PATH);

    const rootfile = findByLocalName(containerDom, "rootfile");
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) {
        throw new Error("Not an EPUB: the container declares no root file.");
    }

    const opfFile = files.get(opfPath);
    if (!opfFile) {
        throw new Error(`Not an EPUB: the package document ${opfPath} is missing.`);
    }

    const packageDocument = parsePackage(toText(opfFile.content));
    const toc = parseToc(files, packageDocument, opfPath);

    const document: EpubDocument = {
        package: packageDocument,
        files,
        toc,
        version: packageDocument.version,
    };

    return { document, files };
}

/** Parse the OPF into a package document. */
function parsePackage(xml: string): PackageDocument {
    const dom = parseXml(xml, "content.opf");
    const packageElement = dom.documentElement;

    const versionValue = packageElement.getAttribute("version");
    const version = parseOpfVersion(versionValue);

    const metadataElement = findByLocalName(packageElement, "metadata");
    const manifestElement = findByLocalName(packageElement, "manifest");
    const spineElement = findByLocalName(packageElement, "spine");

    const manifest: ManifestItem[] = [];
    if (manifestElement) {
        for (const item of findAllByLocalName(manifestElement, "item")) {
            const id = item.getAttribute("id");
            const href = item.getAttribute("href");
            const mediaType = item.getAttribute("media-type");
            if (!id || !href || !mediaType) continue;
            const properties = item.getAttribute("properties") ?? undefined;
            manifest.push(
                properties ? { id, href, mediaType, properties } : { id, href, mediaType },
            );
        }
    }

    const spine: SpineItem[] = [];
    if (spineElement) {
        for (const itemref of findAllByLocalName(spineElement, "itemref")) {
            const idRef = itemref.getAttribute("idref");
            if (!idRef) continue;
            const linear = itemref.getAttribute("linear");
            spine.push(linear === "no" ? { idRef, linear: false } : { idRef });
        }
    }

    const uniqueIdentifier = packageElement.getAttribute("unique-identifier") ?? "id";

    const metadata = parseMetadata(metadataElement, manifest);

    return {
        uniqueIdentifier,
        version,
        metadata,
        manifest,
        spine,
    };
}

/** Parse the metadata element. */
function parseMetadata(metadataElement: Element | null, manifest: ManifestItem[]): Metadata {
    const identifier =
        textOf(metadataElement ?? document, "identifier") ?? `urn:uuid:${crypto.randomUUID()}`;

    const creators = metadataElement
        ? findAllByLocalName(metadataElement, "creator")
              .map((element) => element.textContent?.trim() ?? "")
              .filter((text) => text.length > 0)
        : [];

    const subjects = metadataElement
        ? findAllByLocalName(metadataElement, "subject")
              .map((element) => element.textContent?.trim() ?? "")
              .filter((text) => text.length > 0)
        : [];

    // The cover is identified by the `cover-image` property, or by the
    // legacy `meta name="cover"` element.
    let coverId = manifest.find((item) => item.properties?.includes("cover-image"))?.id;
    if (!coverId && metadataElement) {
        for (const meta of findAllByLocalName(metadataElement, "meta")) {
            if (meta.getAttribute("name") === "cover") {
                coverId = meta.getAttribute("content") ?? undefined;
                break;
            }
        }
    }

    return {
        title: textOf(metadataElement ?? document, "title") ?? "Untitled",
        creators,
        language: textOf(metadataElement ?? document, "language") ?? "en",
        publisher: textOf(metadataElement ?? document, "publisher"),
        description: textOf(metadataElement ?? document, "description"),
        subjects,
        date: textOf(metadataElement ?? document, "date"),
        identifier,
        coverId,
    };
}

/**
 * Parse the table of contents.
 *
 * Prefers the EPUB 3 navigation document, and falls back to the NCX.
 */
function parseToc(
    files: Map<string, EpubFile>,
    packageDocument: PackageDocument,
    opfPath: string,
): NavigationPoint[] {
    const navItem = packageDocument.manifest.find((item) => item.properties?.includes("nav"));
    if (navItem) {
        const navPath = resolveRelative(opfPath, navItem.href);
        const navFile = files.get(navPath);
        if (navFile) {
            const points = parseNavDocument(toText(navFile.content));
            if (points.length > 0) return points;
        }
    }

    const ncxItem = packageDocument.manifest.find((item) => item.mediaType.includes("dtbncx"));
    if (ncxItem) {
        const ncxPath = resolveRelative(opfPath, ncxItem.href);
        const ncxFile = files.get(ncxPath);
        if (ncxFile) {
            return parseNcx(toText(ncxFile.content));
        }
    }

    return [];
}

/** Parse the EPUB 3 navigation document. */
function parseNavDocument(xml: string): NavigationPoint[] {
    const dom = parseXml(xml, "nav.xhtml");
    const nav = findByLocalName(dom, "nav");
    if (!nav) return [];

    const list = findByLocalName(nav, "ol");
    if (!list) return [];

    return parseNavList(list);
}

/** Parse an `<ol>` in a navigation document. */
function parseNavList(list: Element): NavigationPoint[] {
    const points: NavigationPoint[] = [];
    for (const item of findAllByLocalName(list, "li")) {
        const anchor = findByLocalName(item, "a");
        if (!anchor) continue;
        const label = anchor.textContent?.trim() ?? "";
        const src = anchor.getAttribute("href") ?? "";
        const nestedList = findByLocalName(item, "ol");
        const children = nestedList ? parseNavList(nestedList) : [];
        points.push({ label, src, children });
    }
    return points;
}

/** Parse the NCX. */
function parseNcx(xml: string): NavigationPoint[] {
    const dom = parseXml(xml, "toc.ncx");
    const navMap = findByLocalName(dom, "navMap");
    if (!navMap) return [];
    return parseNcxPoints(navMap);
}

/** Parse the `<navPoint>` children of an element. */
function parseNcxPoints(parent: Element): NavigationPoint[] {
    const points: NavigationPoint[] = [];
    for (const navPoint of findAllByLocalName(parent, "navPoint")) {
        // Only the direct children, not nested ones.
        if (navPoint.parentElement !== parent) continue;
        const label = textOf(navPoint, "text") ?? "";
        const content = findByLocalName(navPoint, "content");
        const src = content?.getAttribute("src") ?? "";
        points.push({ label, src, children: parseNcxPoints(navPoint) });
    }
    return points;
}

/** Resolve a relative path against a base path within the container. */
export function resolveRelative(basePath: string, relative: string): string {
    if (relative.startsWith("/")) return relative.slice(1);
    const baseParts = basePath.split("/").slice(0, -1);
    for (const part of relative.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") baseParts.pop();
        else baseParts.push(part);
    }
    return baseParts.join("/");
}

/** Convert file content to text. */
function toText(content: string | Uint8Array): string {
    if (typeof content === "string") return content;
    return new TextDecoder("utf-8").decode(content);
}

/**
 * Unzip an EPUB using `zip.js`.
 *
 * Injected so the reader can be tested without a real archive, and so the
 * ZIP implementation stays a single, auditable dependency.
 */
export type UnzipFunction = (data: ArrayBuffer | Uint8Array) => Promise<Map<string, EpubFile>>;

/**
 * Unzip using the `zip.js` reader.
 */
export const unzipWithZipJs: UnzipFunction = async (data) => {
    const { Uint8ArrayReader, Uint8ArrayWriter, TextWriter, ZipReader } = await import(
        "@zip.js/zip.js"
    );

    const reader = new Uint8ArrayReader(data as Uint8Array);
    const zipReader = new ZipReader(reader);
    const entries = await zipReader.getEntries();

    const files = new Map<string, EpubFile>();
    try {
        for (const entry of entries) {
            if (entry.directory) continue;
            const name = entry.filename;
            const isText =
                name.endsWith(".xhtml") ||
                name.endsWith(".html") ||
                name.endsWith(".css") ||
                name.endsWith(".ncx") ||
                name.endsWith(".opf") ||
                name.endsWith(".xml") ||
                name.endsWith(".txt");

            if (isText) {
                const text = await entry.getData?.(new TextWriter());
                files.set(name, {
                    path: name,
                    content: typeof text === "string" ? text : "",
                    mediaType: "application/xml",
                });
            } else {
                const bytes = await entry.getData?.(new Uint8ArrayWriter());
                files.set(name, {
                    path: name,
                    content: bytes instanceof Uint8Array ? bytes : new Uint8Array(0),
                    mediaType: "application/octet-stream",
                });
            }
        }
    } finally {
        await zipReader.close();
    }
    return files;
};
