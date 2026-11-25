/**
 * The media types the extension accepts.
 *
 * The extension fetches two kinds of thing: a **page**, which has to be
 * HTML, and an **image**, which has to be an image.
 *
 * Without this check the extension would happily write an HTML error page
 * into the EPUB as if it were a picture — a `text/html` file in the manifest
 * with an `image/jpeg` name, which every e-reader rejects.
 *
 * A server that sends no `Content-Type` at all is allowed through: some
 * sites omit it, and the content is checked by what the caller does with it.
 */

/** The media types a page may have. */
const PAGE_MEDIA_TYPES = new Set([
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
]);

/**
 * The media types an image may have.
 *
 * `image/svg+xml` is here because the extension builds its own SVG
 * placeholders; a remote SVG is only fetched when the user allows it.
 */
const IMAGE_MEDIA_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/bmp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
]);

/**
 * The media type of a `Content-Type` header, without its parameters.
 *
 * @param contentType The raw header value.
 * @returns The lower-cased media type, or an empty string when there is none.
 */
export function mediaTypeOf(contentType: string | null): string {
    if (!contentType) return "";
    return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Whether a response's media type is acceptable as a page.
 *
 * A response with no `Content-Type` is accepted: the caller asked for HTML,
 * and the body is parsed as HTML either way. A response that declares
 * something else — a JSON API, say, where a page was expected — is not.
 *
 * @param contentType The raw `Content-Type` header.
 * @returns Whether the body may be parsed as a page.
 */
export function isAcceptablePageType(contentType: string | null): boolean {
    const mediaType = mediaTypeOf(contentType);
    if (!mediaType) return true;
    return PAGE_MEDIA_TYPES.has(mediaType);
}

/**
 * Whether a response's media type is acceptable as an image.
 *
 * @param contentType The raw `Content-Type` header.
 * @returns Whether the body may be stored as an image.
 */
export function isAcceptableImageType(contentType: string | null): boolean {
    const mediaType = mediaTypeOf(contentType);
    if (!mediaType) return true;
    return IMAGE_MEDIA_TYPES.has(mediaType);
}

/** The media types an image may have, for the documentation. */
export const ACCEPTED_IMAGE_MEDIA_TYPES = [...IMAGE_MEDIA_TYPES];
