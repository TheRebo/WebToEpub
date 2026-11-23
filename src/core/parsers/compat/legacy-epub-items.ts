/**
 * The legacy EPUB item model.
 *
 * The baseline built an EPUB from a list of `EpubItem` objects, each of
 * which knew how to turn itself into an XHTML file. The rewrite uses a
 * document model instead (ADR-0008), and the packer no longer needs
 * `EpubItem`.
 *
 * Two parsers still do: `ChyoaParser` defines `ChyoaEpubItem`, a subclass
 * that carries a tree depth for a nested table of contents, and the
 * baseline's `Parser` base offered `webPageToEpubItems` as an extension
 * point. Keeping the classes here means those extension points keep
 * working, even though the new pipeline does not use them to build the
 * final file.
 *
 * See ADR-0002 and ADR-0008.
 */

"use strict";

import { util } from "./legacy-util";
import { ImageInfo } from "./legacy-image-collector";
import { loadZip } from "./legacy-zip";

/**
 * A file that goes into an EPUB.
 */
export class EpubItem {
    /** Where the content came from. */
    sourceUrl: string;
    /** Whether the item appears in the spine. */
    isInSpine = true;
    /** The item's title. */
    chapterTitle: string | null = null;
    /** The item's index. */
    index = 0;
    /** The nodes that make up the item's content. */
    nodes: Node[] | null = null;

    constructor(sourceUrl: string) {
        this.sourceUrl = sourceUrl;
    }

    /** Set the item's index. */
    setIndex(index: number): void {
        this.index = index;
    }

    /** The item's path within the archive. */
    getZipHref(): string {
        return util.makeStorageFileName("OEBPS/Text/", this.index, this.chapterTitle ?? "", "xhtml");
    }

    /** The item's ID in the manifest. */
    getId(): string {
        return `xhtml${util.zeroPad(this.index)}`;
    }

    /** The item's media type. */
    getMediaType(): string {
        return "application/xhtml+xml";
    }

    /** Whether the item holds an SVG. */
    hasSvg(): boolean {
        if (this.nodes === null) return false;
        return this.nodes.some(
            (node) =>
                node.nodeType === Node.ELEMENT_NODE &&
                (node as Element).querySelector("svg") !== null,
        );
    }

    /** Build the item's XHTML document. */
    makeChapterDoc(emptyDocFactory: () => Document): Document {
        const doc = emptyDocFactory();
        const body = doc.getElementsByTagName("body")[0];
        if (!body) return doc;
        for (const node of this.nodes ?? []) {
            const clean = util.sanitizeNode(node);
            if (clean) body.appendChild(clean);
        }
        this.populateTitle(doc, body);
        this.nodes = null;
        return doc;
    }

    /** Give the document a title, if it has none. */
    populateTitle(doc: Document, body: Element): void {
        const title = doc.querySelector("title");
        const h1 = body.querySelector("h1");
        if (title && util.isNullOrEmpty(title.textContent) && h1 !== null) {
            title.textContent = h1.textContent;
        }
    }

    /** The depth of a heading in the table of contents. */
    tagNameToTocDepth(tagName: string): number {
        return Number(tagName[1]) - 1;
    }

    /** The item's entries in the table of contents. */
    *chapterInfo(): Generator<{ depth: number; title: string; src: string }> {
        for (const element of this.nodes ?? []) {
            if (util.isHeaderTag(element)) {
                yield {
                    depth: this.tagNameToTocDepth((element as Element).tagName),
                    title: element.textContent ?? "",
                    src: this.getZipHref(),
                };
            }
        }
    }

    /** The links in the item. */
    getHyperlinks(): HTMLAnchorElement[] {
        const links: HTMLAnchorElement[] = [];
        for (const element of this.nodes ?? []) {
            if (element.nodeType !== Node.ELEMENT_NODE) continue;
            const node = element as Element;
            if (node.tagName.toLowerCase() === "a") {
                links.push(node as HTMLAnchorElement);
            }
            links.push(...(Array.from(node.querySelectorAll("a")) as HTMLAnchorElement[]));
        }
        return links;
    }
}

/**
 * An EPUB item built from a chapter that was its own web page.
 */
export class ChapterEpubItem extends EpubItem {
    /** The arc the chapter starts, if any. */
    newArc: unknown = null;

    constructor(chapter: { sourceUrl: string; title?: string; newArc?: unknown }, content: Element, index: number) {
        super(chapter.sourceUrl);
        this.setIndex(index);
        this.nodes = Array.from(content.childNodes);
        this.chapterTitle = chapter.title ?? null;
        this.newArc = chapter.newArc ?? null;
    }

    override *chapterInfo(): Generator<{ depth: number; title: string; src: string }> {
        const startsNewArc = this.newArc !== null && this.newArc !== undefined;
        if (startsNewArc) {
            yield { depth: 0, title: String(this.newArc), src: this.getZipHref() };
        }
        if (this.chapterTitle !== null) {
            yield { depth: 1, title: this.chapterTitle, src: this.getZipHref() };
        }
    }
}

/**
 * A font that goes into an EPUB.
 *
 * Two sites serve their own typeface with the chapter, and the baseline
 * packed it into the EPUB's `OEBPS/Fonts` folder. The rewrite's packer does
 * not embed fonts — the EPUB specification does not require it, and readers
 * that honour embedded fonts are rare — but the parsers still create these
 * objects and push them onto the collector's list, so the class stays.
 */
export class FontInfo extends ImageInfo {
    /** The font's file name. */
    fontName: string;

    constructor(fontName: string) {
        super("", 0, "");
        this.fontName = fontName;
    }

    /**
     * Pack the font into the EPUB.
     *
     * @param zipWriter The writer to add the font to.
     */
    async packInEpub(zipWriter: unknown): Promise<void> {
        const { BlobReader } = await loadZip();
        const bytes = this.arraybuffer ?? new ArrayBuffer(0);
        const writer = zipWriter as { add(name: string, reader: unknown): void };
        writer.add("OEBPS/Fonts/" + this.fontName, new BlobReader(new Blob([bytes])));
    }
}

/**
 * The metadata of an EPUB.
 */
export class EpubMetaInfo {
    /** The book's unique ID. */
    uuid = "";
    /** The book's title. */
    title = "";
    /** The book's author. */
    author = "";
    /** The book's language. */
    language = "";
    /** The book's file name, without the extension. */
    fileName = "";
    /** The book's subject. */
    subject = "";
    /** The book's description. */
    description = "";
    /** The book's publisher. */
    publisher = "";
    /** The book's publication date. */
    datePublished: string | null = null;
}

/**
 * The collection of items that make up an EPUB.
 */
export class EpubItemSupplier {
    /** The parser that produced the items. */
    parser: unknown;
    /** The items. */
    epubItems: EpubItem[];
    /** The image collector that gathered the images. */
    imageCollector: unknown;

    constructor(parser: unknown, epubItems: EpubItem[], imageCollector?: unknown) {
        this.parser = parser;
        this.epubItems = epubItems;
        this.imageCollector = imageCollector;
    }

    /** The items. */
    get all(): EpubItem[] {
        return this.epubItems;
    }
}
