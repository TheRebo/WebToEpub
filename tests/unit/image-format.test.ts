/**
 * Tests for recognising what an image's bytes are.
 *
 * The EPUB's manifest has to name a media type for every file it lists, and
 * the file name has to end in an extension that matches it. A server that
 * declares no type, or the wrong one, would otherwise put a file into the
 * book that no reader can show.
 */
import { describe, expect, it } from "vitest";
import { imageFormatOf, sniff } from "../../src/core/epub/image-format";

/** The bytes of a file that begins with the given prefix. */
function bytes(prefix: number[], rest = 32): Uint8Array {
    const data = new Uint8Array(prefix.length + rest);
    data.set(prefix, 0);
    return data;
}

describe("sniff", () => {
    it("recognises a PNG", () => {
        expect(sniff(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
            mediaType: "image/png",
            extension: "png",
        });
    });

    it("recognises a JPEG", () => {
        expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
            mediaType: "image/jpeg",
            extension: "jpg",
        });
    });

    it("recognises a GIF", () => {
        expect(sniff(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toEqual({
            mediaType: "image/gif",
            extension: "gif",
        });
    });

    it("recognises a WebP", () => {
        expect(
            sniff(bytes([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])),
        ).toEqual({
            mediaType: "image/webp",
            extension: "webp",
        });
    });

    it("does not call a RIFF file a WebP when it is something else", () => {
        // RIFF is a container. A WAV file starts the same way and is not a
        // picture, and a book that carries one as a picture shows nothing.
        expect(
            sniff(bytes([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])),
        ).toBeUndefined();
    });

    it("recognises a BMP", () => {
        expect(sniff(bytes([0x42, 0x4d]))).toEqual({
            mediaType: "image/bmp",
            extension: "bmp",
        });
    });

    it("recognises an icon", () => {
        expect(sniff(bytes([0x00, 0x00, 0x01, 0x00]))).toEqual({
            mediaType: "image/x-icon",
            extension: "ico",
        });
    });

    it("recognises an AVIF", () => {
        // An ISO base media file: a size, then the box's type, then the brand.
        const data = new Uint8Array(24);
        new TextEncoder().encodeInto("ftyp", data.subarray(4, 8));
        new TextEncoder().encodeInto("avif", data.subarray(8, 12));
        expect(sniff(data)).toEqual({
            mediaType: "image/avif",
            extension: "avif",
        });
    });

    it("recognises an SVG", () => {
        const data = new TextEncoder().encode(
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        );
        expect(sniff(data)).toEqual({
            mediaType: "image/svg+xml",
            extension: "svg",
        });
    });

    it("does not recognise a page as a picture", () => {
        const data = new TextEncoder().encode(
            "<!doctype html><html><body>Not a picture</body></html>",
        );
        expect(sniff(data)).toBeUndefined();
    });

    it("does not recognise nothing at all", () => {
        expect(sniff(new Uint8Array(0))).toBeUndefined();
    });
});

describe("imageFormatOf", () => {
    it("trusts the bytes over what the server declared", () => {
        // A server that calls a PNG a JPEG would put a picture into the book
        // under the wrong name, and a reader shows nothing for it.
        expect(
            imageFormatOf(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg"),
        ).toEqual({
            mediaType: "image/png",
            extension: "png",
        });
    });

    it("uses the declared type when the bytes say nothing", () => {
        // Some servers serve images through a proxy that rewrites the bytes.
        // The server's word is better than nothing.
        expect(imageFormatOf(bytes([0x01, 0x02, 0x03]), "image/jpeg")).toEqual({
            mediaType: "image/jpeg",
            extension: "jpg",
        });
    });

    it("has an answer for a server that declares nothing", () => {
        expect(imageFormatOf(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "")).toEqual({
            mediaType: "image/png",
            extension: "png",
        });
    });

    it("has no answer for bytes that are not a picture", () => {
        expect(imageFormatOf(bytes([0x01, 0x02, 0x03]), "")).toBeUndefined();
    });

    it("gives every accepted type an extension of its own", () => {
        // A media type with no extension would be written as a `.bin` file,
        // and a reader shows nothing for it.
        const types = [
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
            "image/svg+xml",
            "image/avif",
            "image/bmp",
            "image/x-icon",
            "image/vnd.microsoft.icon",
        ];
        for (const type of types) {
            const format = imageFormatOf(new Uint8Array(0), type);
            expect(format, type).toBeDefined();
            expect(format?.extension, type).not.toBe("bin");
        }
    });
});
