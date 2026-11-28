/**
 * The PNG encoder.
 *
 * The extension writes a picture of its own into a book: the stand-in for an
 * image that could not be fetched. That picture has to be a real PNG — a
 * broken one would make the whole book unreadable, which is the very defect
 * the placeholder was introduced to fix.
 *
 * The encoder is therefore checked against an independent implementation:
 * everything it writes is read back with Node's own zlib and compared with
 * what went in.
 */
import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng } from "../../src/core/epub/png";

/** The bytes every PNG file starts with. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A picture with some colour in it. */
function pixels(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(width * height * 3);
    for (let index = 0; index < bytes.length; index += 3) {
        bytes[index] = index % 251;
        bytes[index + 1] = (index * 7) % 253;
        bytes[index + 2] = (index * 13) % 241;
    }
    return bytes;
}

/** The chunks of a PNG file, in the order they appear. */
function chunks(file: Uint8Array): { type: string; data: Uint8Array }[] {
    const found: { type: string; data: Uint8Array }[] = [];
    let offset = 8;
    while (offset + 8 <= file.length) {
        const length =
            ((file[offset] as number) << 24) |
            ((file[offset + 1] as number) << 16) |
            ((file[offset + 2] as number) << 8) |
            (file[offset + 3] as number);
        const type = new TextDecoder().decode(file.subarray(offset + 4, offset + 8));
        found.push({ type, data: file.subarray(offset + 8, offset + 8 + length) });
        offset += 12 + length;
    }
    return found;
}

/** Read a number from four bytes, most significant first. */
function readUint32(source: Uint8Array, offset: number): number {
    return (
        (((source[offset] as number) << 24) |
            ((source[offset + 1] as number) << 16) |
            ((source[offset + 2] as number) << 8) |
            (source[offset + 3] as number)) >>>
        0
    );
}

/** The CRC-32 of a piece of data. */
function crc32(data: Uint8Array): number {
    let crc = -1;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
    }
    return (crc ^ -1) >>> 0;
}

describe("encodePng", () => {
    it("starts with the PNG signature", () => {
        const file = encodePng(2, 2, pixels(2, 2));
        expect([...file.subarray(0, 8)]).toEqual(SIGNATURE);
    });

    it("writes the header, the picture and the end marker", () => {
        const file = encodePng(4, 3, pixels(4, 3));
        const types = chunks(file).map((chunk) => chunk.type);
        expect(types).toEqual(["IHDR", "IDAT", "IEND"]);
    });

    it("says how big the picture is", () => {
        const file = encodePng(4, 3, pixels(4, 3));
        const header = chunks(file)[0]?.data;
        expect(header?.length).toBe(13);
        expect(readUint32(header ?? new Uint8Array(0), 0)).toBe(4);
        expect(readUint32(header ?? new Uint8Array(0), 4)).toBe(3);
        expect(header?.[8]).toBe(8); // The bit depth.
        expect(header?.[9]).toBe(2); // The colour type: truecolour.
    });

    it("checksums every chunk", () => {
        const file = encodePng(4, 3, pixels(4, 3));
        let offset = 8;
        while (offset + 8 <= file.length) {
            const length =
                ((file[offset] as number) << 24) |
                ((file[offset + 1] as number) << 16) |
                ((file[offset + 2] as number) << 8) |
                (file[offset + 3] as number);
            const body = file.subarray(offset + 4, offset + 8 + length);
            const expected = readUint32(file, offset + 8 + length);
            expect(crc32(body)).toBe(expected);
            offset += 12 + length;
        }
    });

    it("holds a picture that reads back exactly as it went in", () => {
        const width = 17;
        const height = 9;
        const source = pixels(width, height);
        const file = encodePng(width, height, source);

        const idat = chunks(file).find((chunk) => chunk.type === "IDAT")?.data;
        expect(idat).toBeDefined();

        // The zlib stream is read back with an independent implementation.
        const raw = new Uint8Array(inflateSync(Buffer.from(idat as Uint8Array)));
        const stride = width * 3;
        expect(raw.length).toBe(height * (stride + 1));

        for (let row = 0; row < height; row += 1) {
            expect(raw[row * (stride + 1)]).toBe(0); // The filter byte.
            const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
            expect([...line]).toEqual([...source.subarray(row * stride, (row + 1) * stride)]);
        }
    });

    it("compresses a flat picture to a fraction of its size", () => {
        const width = 400;
        const height = 300;
        const source = new Uint8Array(width * height * 3).fill(200);
        const file = encodePng(width, height, source);
        expect(file.length).toBeLessThan((width * height * 3) / 10);
    });

    it("refuses a picture that is not the size it claims", () => {
        expect(() => encodePng(2, 2, pixels(3, 3))).toThrow();
    });
});
