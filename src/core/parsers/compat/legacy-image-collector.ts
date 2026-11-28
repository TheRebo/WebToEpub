/**
 * The legacy image collector.
 *
 * The baseline's `ImageCollector` was a large class that owned the whole
 * image pipeline: finding images, fetching them, de-duplicating them by
 * content hash, and rewriting `<img>` tags into the packaged EPUB's own
 * image files. It was tightly coupled to the baseline's `EpubPacker`, which
 * the rewrite replaced with a document model (ADR-0008).
 *
 * The rewrite's download pipeline collects the images a chapter references
 * and packs them itself, so the collector's *fetching* half is gone. What
 * remains is the half the parsers actually depend on:
 *
 *  - `findImagesUsedInDocument` — the parser asks the collector to look at a
 *    chapter's content and record the images it finds;
 *  - `replaceImageTags` — the parser asks the collector to rewrite the image
 *    tags, which in the rewrite means leaving them alone, because the packer
 *    resolves them;
 *  - `imageInfoList`, `imagesToPack`, `numberOfImagesToFetch` — the parsers
 *    read these to decide whether the page had any images at all.
 *
 * Eight parsers extend `ImageCollector` and one extends
 * `VariableSizeImageCollector`, so both classes exist here with the same
 * names and the same extension points.
 *
 * See ADR-0002 and ADR-0008.
 */

"use strict";

import { util } from "./legacy-util";

/**
 * A single image the collector has found.
 */
export class ImageInfo {
    /** The URL of the page that wraps the image. */
    wrappingUrl: string;
    /** The URL of the image itself. */
    sourceUrl: string;
    /** The index of the image in the collector's list. */
    index: number;
    /** Whether this image is the cover. */
    isCover = false;
    /** Whether the image lives outside the gallery. */
    isOutsideGallery = false;
    /** The image's media type. */
    mediaType = "image/jpeg";
    /** The image's bytes, once fetched. */
    arraybuffer: ArrayBuffer | null = null;
    /** The image's height. */
    height: number | null = null;
    /** The image's width. */
    width: number | null = null;
    /** The URL of the original, unwrapped file. */
    dataOrigFileUrl: string | null;
    /** Whether the image has been queued for a fetch. */
    queuedForFetch = false;

    constructor(
        wrappingUrl: string,
        index: number,
        sourceUrl: string,
        dataOrigFileUrl: string | null = null,
    ) {
        this.wrappingUrl = wrappingUrl;
        this.index = index;
        this.sourceUrl = sourceUrl;
        this.dataOrigFileUrl = dataOrigFileUrl;
    }
}

/**
 * The image collector.
 */
export class ImageCollector {
    /** The images found so far. */
    imageInfoList: ImageInfo[] = [];
    /** The images that are waiting to be packed. */
    imagesToPack: ImageInfo[] = [];
    /** The images that still need fetching. */
    imagesToFetch: ImageInfo[] = [];
    /** The cover image. */
    coverImageInfo: ImageInfo | null = null;
    /** The user's preferences, when they have been set. */
    userPreferences: LegacyUserPreferences | null = null;

    /** The URL index, mapping a URL to an image. */
    protected urlIndex = new Map<string, number>();

    /** A collector with no images, for parsers whose sites have none. */
    static StubCollector(): {
        coverImageInfo: null;
        imagesToPackInEpub(): unknown[];
    } {
        return { coverImageInfo: null, imagesToPackInEpub: () => [] };
    }

    /** Forget every image. */
    reset(): void {
        this.imageInfoList = [];
        this.imagesToPack = [];
        this.imagesToFetch = [];
        this.coverImageInfo = null;
        this.urlIndex = new Map();
    }

    /** Take over another collector's state. */
    copyState(other: ImageCollector): void {
        this.imageInfoList = other.imageInfoList;
        this.imagesToPack = other.imagesToPack;
        this.imagesToFetch = other.imagesToFetch;
        this.coverImageInfo = other.coverImageInfo;
        this.urlIndex = other.urlIndex;
        this.userPreferences = other.userPreferences;
    }

    /** Record an image. */
    addImageInfo(
        wrappingUrl: string,
        sourceUrl: string,
        dataOrigFileUrl: string | null = null,
        fetchFirst = false,
    ): ImageInfo {
        let index = this.urlIndex.get(sourceUrl);
        if (index === undefined) index = this.urlIndex.get(wrappingUrl);
        if (index === undefined) index = this.urlIndex.get(dataOrigFileUrl ?? "");

        let info: ImageInfo;
        if (index !== undefined) {
            info = this.imageInfoList[index] as ImageInfo;
        } else {
            index = this.imageInfoList.length;
            info = new ImageInfo(wrappingUrl, index, sourceUrl, dataOrigFileUrl);
            this.imageInfoList.push(info);
            if (fetchFirst) {
                this.imagesToFetch = [info, ...this.imagesToFetch];
            } else {
                this.imagesToFetch.push(info);
            }
        }

        this.urlIndex.set(wrappingUrl, index);
        this.urlIndex.set(sourceUrl, index);
        if (dataOrigFileUrl !== null) this.urlIndex.set(dataOrigFileUrl, index);
        return info;
    }

    /** The image with a given URL, if there is one. */
    imageInfoByUrl(url: string): ImageInfo | null {
        const index = this.urlIndex.get(url);
        if (index === undefined) return null;
        return this.imageInfoList[index] ?? null;
    }

    /** Set the cover image. */
    setCoverImageUrl(url: string | null): void {
        if (!util.isNullOrEmpty(url)) {
            let info = this.imageInfoByUrl(url as string);
            if (info === null) {
                info = this.addImageInfo(url as string, url as string, null, true);
            }
            info.isCover = true;
            this.coverImageInfo = info;
        }
    }

    /** Take the user's preferences into account. */
    onUserPreferencesUpdate(userPreferences: LegacyUserPreferences): void {
        this.userPreferences = userPreferences;
    }

    /** How many images are still waiting to be fetched. */
    numberOfImagesToFetch(): number {
        return this.imagesToFetch.length;
    }

    /**
     * Fetch the images.
     *
     * The rewrite's download pipeline fetches the images, so this only clears
     * the queue. Keeping the call means a parser that awaits it still
     * behaves the same way.
     */
    async fetchImages(
        _progressIndicator?: (value: number) => void,
        _parentPageUrl?: string,
    ): Promise<void> {
        this.imagesToFetch = [];
    }

    /**
     * Find the images a document uses.
     *
     * The baseline also rewrote the `<img>` tags here. The rewrite leaves
     * them in place: the packer resolves them against the chapter's URL, so
     * rewriting them first would lose the source.
     */
    findImagesUsedInDocument(content: Element): void {
        for (const image of content.querySelectorAll("img")) {
            const source = image.getAttribute("src");
            if (!source) continue;
            let absolute: string;
            try {
                absolute = new URL(source, content.ownerDocument.baseURI).href;
            } catch {
                continue;
            }
            this.addImageInfo(absolute, absolute, null, false);
        }
    }

    /**
     * Rewrite the image tags.
     *
     * In the baseline this replaced every `<img>` with a reference to the
     * packaged file. In the rewrite the packer does that, so this is a
     * no-op that keeps the call harmless.
     */
    replaceImageTags(_element: Element): void {
        // The packer resolves image references; nothing to do here.
    }

    /** Prepare the image tags before they are collected. */
    async preprocessImageTags(content: Element, _parentPageUrl: string): Promise<Element> {
        return content;
    }

    /** The URL of the page that holds all the copies of an image. */
    extractWrappingUrl(element: Element): string {
        if (element.tagName.toLowerCase() === "img") {
            return (element as HTMLImageElement).src;
        }
        if (element.tagName.toLowerCase() === "a") {
            return (element as HTMLAnchorElement).href;
        }
        const anchor = element.getElementsByTagName("a")[0] as HTMLAnchorElement | undefined;
        return anchor?.href ?? "";
    }

    /** Whether an element wraps an image in a link. */
    isImageWrapperElement(element: Element): boolean {
        return element.tagName.toLowerCase() === "a" || element.tagName.toLowerCase() === "figure";
    }

    /** The URL of the original, full-size image. */
    convertToUrlOfOriginalSizeImage(url: string): string {
        return url;
    }

    /** The URL of the image to use, given a page that holds several copies. */
    selectImageUrlFromImagePage(dom: Document): string | null {
        const div = dom.querySelector("div.fullMedia");
        if (div === null) return null;
        const link = div.querySelector("a") as HTMLAnchorElement | null;
        return link === null ? null : link.href;
    }
}

/**
 * The image collector that lets the user pick the image size.
 */
export class VariableSizeImageCollector extends ImageCollector {
    /** The rule that picks which URL to fetch. */
    initialUrlToTry: (imageInfo: ImageInfo) => string = (imageInfo) => imageInfo.sourceUrl;

    /** Take the user's preferences into account. */
    override onUserPreferencesUpdate(userPreferences: LegacyUserPreferences): void {
        super.onUserPreferencesUpdate(userPreferences);
        if (userPreferences.highestResolutionImages.value) {
            this.initialUrlToTry = (imageInfo) => imageInfo.wrappingUrl;
        } else {
            this.initialUrlToTry = (imageInfo) => imageInfo.sourceUrl;
        }
    }
}

/**
 * The subset of the user's preferences the legacy code reads.
 *
 * Each entry is an object with a `value`, exactly as the baseline's
 * `UserPreferences` held them, because the parsers read `.value` directly.
 */
export interface LegacyUserPreferences {
    /** Remove the author notes from a chapter. */
    removeAuthorNotes: { value: boolean };
    /** Remove the "translated from" note. */
    removeOriginal: { value: boolean };
    /** Remove the alternate-translation marker. */
    unSuperScriptAlternateTranslations: { value: boolean };
    /** Skip a chapter that fails to fetch, instead of failing the run. */
    skipChaptersThatFailFetch: { value: boolean };
    /** Remove chapters that are translations of another chapter. */
    removeTranslated: { value: boolean };
    /** Fetch the highest-resolution version of each image. */
    highestResolutionImages: { value: boolean };
    /** Treat an empty page as a 403. */
    noContentToError403: { value: boolean };
    /** Skip the images entirely. */
    skipImages: { value: boolean };
    /** Remove the duplicate images. */
    removeDuplicateImages: { value: boolean };
    /** Use SVG where the image is an SVG. */
    useSvgForImages: { value: boolean };
    /** Include the image's source URL as a comment. */
    includeImageSourceUrl: { value: boolean };
    /** Remove the "next" and "previous" chapter links. */
    removeNextAndPreviousChapterHyperlinks: { value: boolean };
    /** Add the information page to the EPUB. */
    addInformationPage: { value: boolean };
    /** Put the chapters page inside the chapter list. */
    chaptersPageInChapterList: { value: boolean };
    /** Remove the chapter numbers from the titles. */
    removeChapterNumbers: { value: boolean };
    /** The delay between chapters, in milliseconds. */
    manualDelayPerChapter: { value: string };
    /** Whether the manual delay overrides the parser's own delay. */
    overrideMinimumDelay: { value: boolean };
    /** The file's author. */
    fileAuthorAs: { value: string };
    /** The translator's name. */
    translator: { value: string };
    /** The site's password, for sites that need one. */
    sitePassword: { value: string };
    /** Whether the AI translation is used. */
    selectTranslationAi: { value: boolean };
    /** Whether a longer retry is used. */
    selectRetryLonger: { value: boolean };
    /** The reading list, for the parsers that read it. */
    readingList: {
        /** Deselect the chapters that are no longer in the list. */
        deselectOldChapters(url: string, chapters: unknown[]): Promise<void>;
        /** Update the reading list. */
        update(url: string, chapters: unknown[]): void;
        /** Set the reading list's checkbox for a URL. */
        setReadingListCheckbox(url: string): void;
    };
}

/**
 * The default preferences.
 *
 * The flags the settings store owns are overwritten by
 * `toLegacyUserPreferences`. The rest have no setting, so the value here is
 * what every user gets: the original extension's default for each.
 */
export function makeLegacyUserPreferences(): LegacyUserPreferences {
    const flag = (value = false): { value: boolean } => ({ value });
    return {
        removeAuthorNotes: flag(),
        // The original extension removed the untranslated text from the
        // machine-translation sites by default, and the rewrite has no
        // setting for it, so its default is the one users get (ADR-0047).
        removeOriginal: flag(true),
        unSuperScriptAlternateTranslations: flag(),
        skipChaptersThatFailFetch: flag(),
        removeTranslated: flag(),
        highestResolutionImages: flag(),
        noContentToError403: flag(),
        skipImages: flag(),
        removeDuplicateImages: flag(),
        useSvgForImages: flag(),
        includeImageSourceUrl: flag(),
        removeNextAndPreviousChapterHyperlinks: flag(true),
        addInformationPage: flag(),
        chaptersPageInChapterList: flag(),
        removeChapterNumbers: flag(),
        manualDelayPerChapter: { value: "" },
        overrideMinimumDelay: flag(),
        fileAuthorAs: { value: "" },
        translator: { value: "" },
        sitePassword: { value: "" },
        selectTranslationAi: flag(),
        selectRetryLonger: flag(),
        readingList: {
            deselectOldChapters: async () => undefined,
            update: () => undefined,
            setReadingListCheckbox: () => undefined,
        },
    };
}
