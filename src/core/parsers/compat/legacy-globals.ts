/**
 * The ambient global shims.
 *
 * The baseline's parsers were plain scripts that ran in a page where a dozen
 * globals happened to exist: `UIText`, `ErrorLog`, `ChapterUrlsUI`,
 * `CoverImageUI`, `ProgressBar`, `Imgur`, `DOMPurify`, `main`,
 * `FetchErrorHandler`, `ImageCollector`, `EpubItem` and friends. Nothing
 * declared them; they simply had to be there.
 *
 * The rewrite does not have globals. It has modules. But the 434 parsers are
 * the product's core asset and they must keep working, so this module
 * re-creates the handful of globals the parsers actually touch, as ordinary
 * exported objects that the codemod turns into imports.
 *
 * Every shim here is **inert**: it records what happened and reports it
 * through the message bus, but it does not try to drive a UI that no longer
 * exists in this shape. The one exception is `ErrorLog`, which forwards to
 * the workbench's log panel, because a parser that fails silently is worse
 * than a noisy one.
 *
 * See ADR-0002.
 */

"use strict";

import { sanitizeHtml } from "../../util/sanitize";
import { util } from "./legacy-util";
import { HttpClient } from "./legacy-http-client";

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/**
 * The legacy message catalogue.
 *
 * The baseline read these from `chrome.i18n`. The rewrite's catalogues are
 * written for the new UI and do not carry the baseline's diagnostic strings,
 * so these are the English originals, kept close to the baseline wording so
 * that a message a user has seen before still reads the same.
 */
export const UIText = {
    Error: {
        /** The chapter's content element could not be found. */
        errorContentNotFound: (url: string): string =>
            `Content not found for ${url}. The site may have changed, or the chapter may be locked.`,
        /** The table of contents held no chapters. */
        noChaptersFound: (): string => "No chapters found.",
        /** The page held no images. */
        noImagesFound: (): string => "No images found.",
        /** A generic fetch failure. */
        htmlFetchFailed: (url: string, error: unknown): string =>
            `Could not fetch ${url}: ${String(error)}`,
        /** An Imgur gallery could not be expanded. */
        imgurFetchFailed: (url: string, parentUrl: string, error: unknown): string =>
            `Could not expand the Imgur gallery at ${url} (on ${parentUrl}): ${String(error)}`,
        /** The chapter could not be converted to XHTML. */
        convertToXhtmlWarning: (filename: string, url: string, errorMessage: string): string =>
            `Could not fully convert "${filename}" (${url}) to XHTML: ${errorMessage}`,
        /** The user pressed "fetch" with no chapters selected. */
        noChaptersFoundAndFetchClicked: (): string =>
            "No chapters were selected, so there is nothing to fetch.",
    },
    Warning: {
        /** The site has no dedicated parser. */
        parserDisabledNotification: (): string =>
            "This site does not have a dedicated parser, so the results may not be accurate.",
        /** The chapter had no visible text. */
        warningNoVisibleContent: (url: string): string =>
            `The chapter at ${url} has no visible text.`,
        /** The chapter was empty, so it is reported as a 403. */
        warningNoContentTo403ErrorResponse: (hostname: string): string =>
            `No content was found at ${hostname}. The site may be blocking the request.`,
        /** The request can be retried. */
        httpFetchCanRetry: (): string => "The request can be retried.",
    },
    Default: {
        /**
         * The placeholder shown for a chapter that could not be fetched.
         *
         * The baseline's message showed the chapter's URL and the error that
         * stopped it being fetched. The URL alone was not enough: a reader
         * with a chapter list in front of them cannot tell which chapter
         * failed or why.
         */
        chapterPlaceholderMessage: (url: string, error: string): string =>
            `This is a placeholder. Attempt to fetch chapter from '${url}' failed with error: ${error}`,
        /** The title of the generated information page. */
        informationPageTitle: "Information",
        /** The label of the table-of-contents link on the information page. */
        tableOfContentsUrl: "Table of contents URL:",
    },
    Common: {
        /** The label of a cancel button. */
        cancel: "Cancel",
    },
};

/* ------------------------------------------------------------------ */
/* Fetch cache                                                          */
/* ------------------------------------------------------------------ */

/**
 * The page cache.
 *
 * Some sites put several chapters on one page. The baseline cached the page's
 * DOM so that the extra chapters cost no extra requests; three parsers use
 * this. The rewrite keeps the same behaviour, and the same interface.
 */
export class FetchCache {
    /** The path of the cached page. */
    path: string | null = null;
    /** The cached page. */
    dom: Document | null = null;

    /** Fetch a page, or return the cached copy. */
    async fetch(url: string): Promise<Document> {
        if (!this.inCache(url)) {
            this.dom = (await HttpClient.wrapFetch(url)).responseXML;
            this.path = new URL(url).pathname;
        }
        return (this.dom as Document).cloneNode(true) as Document;
    }

    /** Whether the page is the cached one. */
    inCache(url: string): boolean {
        return new URL(url).pathname === this.path && this.dom !== null;
    }
}

/* ------------------------------------------------------------------ */
/* Footnotes                                                            */
/* ------------------------------------------------------------------ */

/**
 * The footnote extractor.
 *
 * Two sites hide their footnotes in an inline script and show them in a
 * tooltip. The baseline pulled the text out of the script and put it back as
 * a `<span>`, so that the footnote survives into the EPUB. The rewrite does
 * the same thing, on the same markup.
 */
export class FootnoteExtractor {
    /** The footnote spans, in the order the page uses them. */
    scriptElementsToFootnotes(dom: Document): Element[] {
        const indexedFootnotes = new Map<string, string>();
        for (const script of Array.from(dom.querySelectorAll("script"))) {
            const text = script.textContent ?? "";
            if (!text.includes("toolTips('.classtoolTips")) continue;
            indexedFootnotes.set(this.getId(text), this.extractFootnoteText(text));
        }

        return this.getIdsUsedOnPage(dom).map((id) =>
            this.makeSpan(indexedFootnotes.get(id) ?? "", dom),
        );
    }

    /** The footnote ids the page refers to. */
    getIdsUsedOnPage(dom: Document): string[] {
        const extractId = (span: Element): string | undefined =>
            Array.from(span.classList).find((value) => value.startsWith("class"));

        return Array.from(dom.querySelectorAll("span.tooltipsall"))
            .map(extractId)
            .filter((id): id is string => id !== undefined);
    }

    /** The footnote id inside a script. */
    getId(script: string): string {
        return this.extractSubstring(script, "toolTips('.", ",").replace("'", "");
    }

    /** Build the span that holds a footnote's text. */
    makeSpan(content: string, dom: Document): Element {
        const span = dom.createElement("span");
        span.textContent = content;
        return span;
    }

    /** The footnote's text, inside a script. */
    extractFootnoteText(content: string): string {
        return this.extractSubstring(content, 'tt_store_content = "', "\"; toolTips('");
    }

    /** The text between two markers. */
    extractSubstring(content: string, startTag: string, endTag: string): string {
        const start = content.indexOf(startTag);
        const trimmed = content.substring(start + startTag.length);
        return trimmed.substring(0, trimmed.indexOf(endTag));
    }
}

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

/** A sink for the log messages the parsers produce. */
export interface LogSink {
    /** Record a message. */
    log(message: string): void;
}

/** The default sink: the console. */
const consoleSink: LogSink = {
    log(message: string): void {
        console.warn(`[kintsugi] ${message}`);
    },
};

let sink: LogSink = consoleSink;

/** Replace the log sink. */
export function setLogSink(next: LogSink): void {
    sink = next;
}

/**
 * The legacy error log.
 *
 * The baseline popped a modal dialog for every error, which made bulk
 * downloads unusable: a single locked chapter stopped the run behind a
 * dialog. The rewrite collects messages instead, and the workbench shows
 * them in a panel the user can dismiss when they are ready.
 */
export const ErrorLog = {
    /** Record a message without interrupting the user. */
    log(error: unknown): void {
        sink.log(error instanceof Error ? error.message : String(error));
    },
    /** Record a message and, in the baseline, show it. Here it only records. */
    showErrorMessage(error: unknown): void {
        sink.log(error instanceof Error ? error.message : String(error));
    },
};

/* ------------------------------------------------------------------ */
/* Progress and UI shims                                                */
/* ------------------------------------------------------------------ */

/**
 * The chapter list's download-state indicator.
 *
 * The baseline set a CSS class on a table row. The rewrite reports progress
 * through the message bus, so the shim records the last state and moves on.
 */
export const ChapterUrlsUI = {
    /** The chapter is waiting for its turn. */
    DOWNLOAD_STATE_SLEEPING: "sleeping",
    /** The chapter is being fetched. */
    DOWNLOAD_STATE_DOWNLOADING: "downloading",
    /** The chapter has been fetched. */
    DOWNLOAD_STATE_LOADED: "loaded",
    /** The last state reported, per chapter URL. */
    states: new Map<string, string>(),
    /** Report a chapter's state. */
    showDownloadState(row: unknown, state: string): void {
        const key = typeof row === "string" ? row : String(row ?? "");
        ChapterUrlsUI.states.set(key, state);
    },
};

/**
 * The cover image controls.
 *
 * The baseline let the user paste a cover URL. The rewrite keeps that feature
 * in the options page, but the parser-side shim only remembers the value.
 */
export const CoverImageUI = {
    /** The cover URL the user chose. */
    coverImageUrl: null as string | null,
    /** Whether the cover URL input is shown. */
    showCoverImageUrlInput(_visible: boolean): void {
        // The rewrite shows the field from the options page, not the popup.
    },
    /** Set the cover URL. */
    setCoverImageUrl(url: string | null): void {
        CoverImageUI.coverImageUrl = url;
    },
    /** The cover URL. */
    getCoverImageUrl(): string | null {
        return CoverImageUI.coverImageUrl;
    },
    /** React to the user picking a cover URL. */
    onCoverFromUrlClick(_enable: boolean, _images?: unknown): void {
        // The rewrite collects the cover image in the download pipeline.
    },
};

/**
 * The progress bar.
 *
 * The baseline drove a `<progress>` element in the popup. The rewrite's
 * workbench polls the worker for job progress, so the shim only counts.
 */
export const ProgressBar = {
    /** The current value. */
    value: 0,
    /** The maximum value. */
    max: 100,
    /** Set the value. */
    setValue(value: number): void {
        ProgressBar.value = value;
    },
    /** Set the maximum. */
    setMax(max: number): void {
        ProgressBar.max = max;
    },
    /** Advance the value by one step. */
    updateValue(step: number): void {
        ProgressBar.value += step;
    },
};

/**
 * The popup's entry point.
 *
 * The baseline's `main` object owned the popup's buttons. The rewrite's
 * workbench is a separate page, so the one call a parser makes — asking for
 * the "pack EPUB" button so it can disable it — returns a detached element
 * that is never clicked.
 */
export const main = {
    /** The "pack EPUB" button. */
    getPackEpubButton(): HTMLButtonElement {
        const button = document.createElement("button");
        button.disabled = false;
        return button;
    },
};

/* ------------------------------------------------------------------ */
/* Sanitising                                                          */
/* ------------------------------------------------------------------ */

/**
 * The DOMPurify shim.
 *
 * One parser (`FictionreadParser`) calls `DOMPurify.sanitize` directly. The
 * rewrite already sanitises at the EPUB boundary, so this is the same
 * sanitiser, exposed under the legacy name.
 */
export const DOMPurify = {
    /** Sanitise an HTML string. */
    sanitize(html: string): string {
        return sanitizeHtml(html);
    },
};

/* ------------------------------------------------------------------ */
/* Imgur                                                               */
/* ------------------------------------------------------------------ */

/**
 * The Imgur helpers.
 *
 * Two parsers use Imgur galleries, which the site renders with images
 * created at run time. The baseline scraped the gallery's inline JSON; the
 * rewrite keeps that, because there is no API to call instead.
 */
export const Imgur = {
    /** Whether a host name is Imgur's. */
    isImgurHostName(host: string): boolean {
        return host === "imgur.com" || host.endsWith(".imgur.com");
    },
    /**
     * Whether a link points at a gallery rather than an image.
     *
     * The baseline read the file name from a `URL`, but passed an anchor
     * element, which has no `pathname` — so the baseline threw a `TypeError`
     * for every Imgur link. The rewrite reads the anchor's own path, which
     * is what the check was always meant to do.
     */
    isLinkToGallery(hyperlink: HTMLAnchorElement): boolean {
        return !hyperlink.pathname.includes(".");
    },
    /** Whether a link points at a gallery that holds no image of its own. */
    isHyperlinkToImgurGallery(hyperlink: HTMLAnchorElement): boolean {
        return (
            Imgur.isImgurHostName(hyperlink.hostname) &&
            hyperlink.querySelector("img") === null &&
            Imgur.isLinkToGallery(hyperlink)
        );
    },
    /** The gallery links in a document that should be expanded. */
    getGalleryLinksToReplace(dom: Document): HTMLAnchorElement[] {
        return util.getElements(
            dom,
            "a",
            Imgur.isHyperlinkToImgurGallery as (element: Element) => boolean,
        ) as HTMLAnchorElement[];
    },
    /** The gallery's inline JSON, if the page has it. */
    findImagesJson(dom: Document): Record<string, unknown> | null {
        for (const text of Imgur.scriptsWithRunSlots(dom)) {
            const json = util.locateAndExtractJson(text, "item:") as Record<string, unknown> | null;
            if (json !== null) return json;
        }
        return null;
    },
    /** The page's scripts that hold the gallery's run slots. */
    scriptsWithRunSlots(dom: Document): string[] {
        return [...dom.querySelectorAll("script")]
            .map((script) => script.textContent ?? "")
            .filter((text) => text.includes("window.runSlots"));
    },
    /** The gallery's image list. */
    findImagesList(dom: Document): Array<{ hash: string; ext: string }> | null {
        const json = Imgur.findImagesJson(dom);
        if (json === null) return null;
        const album = json.album_images as
            | { images?: Array<{ hash: string; ext: string }> }
            | undefined;
        if (album?.images) return album.images;
        return [json as unknown as { hash: string; ext: string }];
    },
    /** Turn a gallery into ordinary `<img>` elements. */
    convertGalleryToConventionalForm(dom: Document): Element | null {
        const images = Imgur.findImagesList(dom);
        if (images === null) return null;
        const doc = document.implementation.createHTMLDocument("");
        const div = doc.createElement("div");
        doc.body.appendChild(div);
        for (const item of images) {
            const img = doc.createElement("img");
            img.src = `https://i.imgur.com/${item.hash}${item.ext}`;
            div.appendChild(img);
        }
        return div;
    },
    /** Add the `?grid` suffix an Imgur gallery needs to show its images. */
    fixupImgurGalleryUrl(url: string): string {
        const link = document.createElement("a");
        link.href = url;
        if (Imgur.isHyperlinkToImgurGallery(link) && !url.endsWith("?grid")) {
            return `${url}?grid`;
        }
        return url;
    },
};

/* ------------------------------------------------------------------ */
/* Fetch errors                                                        */
/* ------------------------------------------------------------------ */

/**
 * The legacy fetch error handler.
 *
 * One parser (`WattpadParser`) extends it to build its own retry dialogue.
 * The rewrite's fetch client owns retries, so the base class here is a thin
 * adapter that reports the failure and rejects.
 */
export class FetchErrorHandler {
    /** Build the message shown when a fetch fails. */
    makeFailMessage(url: string, error: unknown): string {
        return UIText.Error.htmlFetchFailed(url, error);
    }

    /** Build the message shown when a fetch fails but can be retried. */
    makeFailCanRetryMessage(url: string, error: unknown): string {
        return `${this.makeFailMessage(url, error)} ${UIText.Warning.httpFetchCanRetry()}`;
    }

    /** The label of the cancel button. */
    getCancelButtonText(): string {
        return UIText.Common.cancel;
    }

    /** The label of the cancel button. */
    static cancelButtonText(): string {
        return UIText.Common.cancel;
    }

    /** Handle a network-level failure. */
    onFetchError(url: string, error: unknown): Promise<never> {
        return Promise.reject(new Error(this.makeFailMessage(url, error)));
    }

    /** Handle an HTTP-level failure. */
    onResponseError(
        url: string,
        _wrapOptions: unknown,
        response: { url?: string; status?: number },
        errorMessage?: string,
    ): Promise<never> {
        const message =
            errorMessage ??
            this.makeFailMessage(response.url ?? url, response.status ?? "unknown status");
        return Promise.reject(new Error(message));
    }
}
