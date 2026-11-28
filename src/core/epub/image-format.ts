/**
 * What an image's bytes actually are.
 *
 * A server may declare a media type, may declare the wrong one, or may declare
 * none at all. The EPUB's manifest has to name a media type for every file it
 * lists, and the file name has to end in an extension that matches it — a
 * reader that finds an image listed as `image/png` and named `.bin` will show
 * nothing at all.
 *
 * So the bytes are the authority. This module recognises the picture formats
 * the extension accepts by their signatures, which is the one thing a server
 * cannot get wrong about its own file.
 *
 * See ADR-0024 and ADR-0037.
 */

/** A picture format the extension recognises. */
export interface ImageFormat {
    /** The media type the format is written as. */
    mediaType: string;
    /** The file extension the format is written with. */
    extension: string;
}

/**
 * The signatures the formats are recognised by.
 *
 * Each entry is the bytes a file of that format starts with. The formats are
 * listed in the order they are checked, because some of them share a prefix:
 * JPEG's `FF D8 FF` is followed by a marker that says which flavour it is, and
 * the plain `FF D8` check has to come after it.
 */
const SIGNATURES: Array<{ bytes: number[]; format: ImageFormat }> = [
    {
        // PNG: an eight-byte signature that cannot occur by accident.
        bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        format: { mediaType: "image/png", extension: "png" },
    },
    {
        // GIF: "GIF87a" or "GIF89a".
        bytes: [0x47, 0x49, 0x46, 0x38],
        format: { mediaType: "image/gif", extension: "gif" },
    },
    {
        // RIFF: a container. WebP is the only picture inside it that the
        // extension accepts, and it says so in the next four bytes.
        bytes: [0x52, 0x49, 0x46, 0x46],
        format: { mediaType: "image/webp", extension: "webp" },
    },
    {
        // BMP: "BM".
        bytes: [0x42, 0x4d],
        format: { mediaType: "image/bmp", extension: "bmp" },
    },
    {
        // ICO: a reserved word followed by a count.
        bytes: [0x00, 0x00, 0x01, 0x00],
        format: { mediaType: "image/x-icon", extension: "ico" },
    },
];

/**
 * Whether the bytes start with the signature.
 *
 * @param data The bytes.
 * @param signature The signature to look for.
 * @returns Whether the bytes start with it.
 */
function startsWith(data: Uint8Array, signature: number[]): boolean {
    if (data.length < signature.length) return false;
    return signature.every((byte, index) => data[index] === byte);
}

/**
 * Whether the bytes are a JPEG.
 *
 * A JPEG starts with `FF D8 FF`, and the byte after that says which flavour
 * it is. Every JPEG has it, so the check is on three bytes rather than two.
 *
 * @param data The bytes.
 * @returns Whether they are a JPEG.
 */
function isJpeg(data: Uint8Array): boolean {
    return (
        data.length >= 3 &&
        data[0] === 0xff &&
        data[1] === 0xd8 &&
        data[2] === 0xff &&
        // The fourth byte names the flavour: `E0` for JFIF, `E1` for EXIF, and
        // `DB`, `C0` and the rest for the tables and the frame itself.
        (data[3] ?? 0) >= 0xc0
    );
}

/**
 * Whether the bytes are an SVG.
 *
 * An SVG is text, and it is XML, so it starts with `<?xml` or with a `<`
 * followed by an element. The check is deliberately loose: the bytes are
 * decoded as UTF-8 and the leading whitespace is skipped, because an SVG may
 * begin with a comment or a doctype.
 *
 * @param data The bytes.
 * @returns Whether they look like an SVG.
 */
function isSvg(data: Uint8Array): boolean {
    // The first chunk of an SVG is enough to tell; a file that is entirely
    // one long line is not a picture anyone will open.
    const head = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, 512));
    const trimmed = head.trimStart().toLowerCase();
    if (!trimmed.startsWith("<")) return false;
    // An XML declaration or a comment can open an XHTML error page as easily
    // as an SVG, so the first real element has to be `<svg>`.
    const element = /<(?![?!])([a-z][\w:-]*)/.exec(
        trimmed.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/g, ""),
    );
    return element?.[1] === "svg" || element?.[1] === "svg:svg";
}

/**
 * The format the bytes are in.
 *
 * The media type the server declared is preferred when it is one the
 * extension accepts, because a server that says `image/jpeg` is right far
 * more often than a signature check is. The bytes are the fallback, and the
 * tie-breaker when the two disagree.
 *
 * @param data The bytes.
 * @param declared The media type the server declared, if any.
 * @returns The format, or `undefined` when the bytes are not a picture the
 *   extension can write.
 */
export function imageFormatOf(data: Uint8Array, declared?: string): ImageFormat | undefined {
    const declaredType = declared?.trim().toLowerCase() ?? "";

    // The bytes are checked first when they say something definite, so that a
    // server cannot label a PNG as a JPEG and have the book carry a picture
    // the reader cannot show.
    const sniffed = sniff(data);
    if (sniffed) return sniffed;

    // The bytes say nothing, so the server's word is taken.
    switch (declaredType) {
        case "image/png":
            return { mediaType: "image/png", extension: "png" };
        case "image/jpeg":
        case "image/jpg":
            return { mediaType: "image/jpeg", extension: "jpg" };
        case "image/gif":
            return { mediaType: "image/gif", extension: "gif" };
        case "image/webp":
            return { mediaType: "image/webp", extension: "webp" };
        case "image/svg+xml":
            return { mediaType: "image/svg+xml", extension: "svg" };
        case "image/avif":
            return { mediaType: "image/avif", extension: "avif" };
        case "image/bmp":
            return { mediaType: "image/bmp", extension: "bmp" };
        case "image/x-icon":
        case "image/vnd.microsoft.icon":
            return { mediaType: "image/x-icon", extension: "ico" };
        default:
            return undefined;
    }
}

/**
 * The format the bytes are in, by signature alone.
 *
 * @param data The bytes.
 * @returns The format, or `undefined` when the bytes are not a picture the
 *   extension recognises.
 */
export function sniff(data: Uint8Array): ImageFormat | undefined {
    if (data.length === 0) return undefined;

    if (isJpeg(data)) return { mediaType: "image/jpeg", extension: "jpg" };

    // An ISO base media file — AVIF and HEIC are both — is a box whose type is
    // "ftyp". The box's size comes first and varies, so the type is read
    // rather than matched, and the brand that follows says which format it is.
    // This is checked before the fixed signatures because the box's size is
    // not fixed.
    if (data.length >= 12) {
        const boxType = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(4, 8));
        if (boxType === "ftyp") {
            // The brand is four bytes and is the format's own name: "avif" for
            // an AVIF, "heic" for a HEIC. The compatible brands follow it.
            const brand = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(8, 12));
            const name = brand.trim().toLowerCase();
            if (name === "avif" || name === "avis") {
                return { mediaType: "image/avif", extension: "avif" };
            }
            // A HEIC is not a picture the extension writes, and a file that
            // says it is a HEIC and is not an AVIF is not a picture at all.
            return undefined;
        }
    }

    for (const { bytes, format } of SIGNATURES) {
        if (!startsWith(data, bytes)) continue;

        // RIFF is a container: only WebP is a picture inside one that the
        // extension accepts, and it names itself in the next four bytes.
        if (format.mediaType === "image/webp") {
            const marker = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(8, 12));
            if (marker !== "WEBP") continue;
        }

        return format;
    }

    if (isSvg(data)) return { mediaType: "image/svg+xml", extension: "svg" };

    return undefined;
}
