/**
 * A PNG encoder.
 *
 * The extension needs to put a picture of its own into a book: the stand-in
 * for an image that could not be downloaded, and the stand-in for an SVG the
 * user does not want. A stand-in has to be a *raster* image, because the
 * whole point of the setting that hides SVG images is that a book should not
 * carry any.
 *
 * The encoder is written by hand rather than taken from a library, for two
 * reasons. The extension ships no image library, and a library would be
 * another megabyte of code to audit. And the encoder has to be synchronous:
 * the download manager builds its placeholders in the middle of a loop that
 * is already deciding what to do with a chapter.
 *
 * PNG is a container of length-prefixed, CRC-checked chunks. The picture
 * itself is a zlib stream of filtered scanlines, so this module also carries
 * a small deflate encoder: the "fixed Huffman" variant of the format, which
 * uses a code table that is baked into the format rather than carried in the
 * file. A flat picture — which is what a placeholder is — compresses to a
 * fraction of its size under it.
 *
 * See ADR-0029.
 */

/** The bytes every PNG file starts with. */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Encode a picture as a PNG.
 *
 * @param width The picture's width, in pixels.
 * @param height The picture's height, in pixels.
 * @param pixels The picture's pixels: three bytes — red, green, blue — for
 *   each pixel, in order, without padding.
 * @returns The PNG file.
 */
export function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
    const expected = width * height * 3;
    if (pixels.length !== expected) {
        throw new Error(`Expected ${expected} bytes of pixels, got ${pixels.length}`);
    }

    const header = new Uint8Array(13);
    writeUint32(header, 0, width);
    writeUint32(header, 4, height);
    header[8] = 8; // The bit depth: eight bits per channel.
    header[9] = 2; // The colour type: truecolour, without an alpha channel.
    header[10] = 0; // The compression method: deflate.
    header[11] = 0; // The filter method: the standard one.
    header[12] = 0; // The interlace method: none.

    const idat = zlibCompress(scanlines(width, height, pixels));

    return concat([
        PNG_SIGNATURE,
        chunk("IHDR", header),
        chunk("IDAT", idat),
        chunk("IEND", new Uint8Array(0)),
    ]);
}

/**
 * Lay the pixels out as PNG scanlines.
 *
 * Every scanline is prefixed with a filter byte that says how it was
 * prepared. Filter zero — no preparation — is used here: a placeholder is
 * made of flat areas, and the compression does the work.
 *
 * @param width The picture's width, in pixels.
 * @param height The picture's height, in pixels.
 * @param pixels The picture's pixels.
 * @returns The raw data the compressor is given.
 */
function scanlines(width: number, height: number, pixels: Uint8Array): Uint8Array {
    const stride = width * 3;
    const raw = new Uint8Array(height * (stride + 1));
    for (let row = 0; row < height; row += 1) {
        const start = row * (stride + 1);
        raw[start] = 0;
        raw.set(pixels.subarray(row * stride, (row + 1) * stride), start + 1);
    }
    return raw;
}

/**
 * Wrap compressed data in the container the zlib format defines.
 *
 * @param data The compressed data.
 * @returns The zlib stream.
 */
function zlibCompress(data: Uint8Array): Uint8Array {
    const deflated = deflate(data);
    const checksum = new Uint8Array(4);
    writeUint32(checksum, 0, adler32(data));
    // The two-byte header: the compression method (deflate), a window size of
    // 32 KB, and the check bits that make the header a multiple of 31.
    return concat([new Uint8Array([0x78, 0x01]), deflated, checksum]);
}

/**
 * The lengths a match can have, and the code each length is written with.
 *
 * A length of three to ten is written exactly; longer lengths are written as
 * a base plus a number of extra bits.
 */
const LENGTH_BASES = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
];

/** The number of extra bits each length code carries. */
const LENGTH_EXTRA_BITS = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

/** The distances a match can have, and the code each distance is written with. */
const DISTANCE_BASES = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
    3073, 4097, 6145, 8193, 12289, 16385, 24577,
];

/** The number of extra bits each distance code carries. */
const DISTANCE_EXTRA_BITS = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
    13,
];

/** The largest distance a match can reach, which is the size of the window. */
const MAX_DISTANCE = 32768;

/** The longest match the format allows. */
const MAX_MATCH = 258;

/** The shortest match the format allows. */
const MIN_MATCH = 3;

/**
 * Compress data with the fixed-Huffman variant of deflate.
 *
 * The format's fixed code table is used for the literals and the lengths, and
 * the distances use their own five-bit codes. Matches are found with a hash
 * chain: a table of the most recent position for each three-byte sequence,
 * and a list of the positions before it.
 *
 * @param data The data to compress.
 * @returns The compressed data.
 */
function deflate(data: Uint8Array): Uint8Array {
    const writer = new BitWriter();
    writer.writeBits(1, 1); // This is the last block.
    writer.writeBits(1, 2); // The block type: fixed Huffman codes.

    const head = new Int32Array(1 << 15).fill(-1);
    const previous = new Int32Array(data.length).fill(-1);

    /** The hash of the three bytes at a position. */
    const hashAt = (position: number): number =>
        (((data[position] as number) << 10) ^
            ((data[position + 1] as number) << 5) ^
            (data[position + 2] as number)) &
        0x7fff;

    let position = 0;
    while (position < data.length) {
        let bestLength = 0;
        let bestDistance = 0;

        if (position + MIN_MATCH <= data.length) {
            const hash = hashAt(position);
            let candidate = head[hash] ?? -1;
            const limit = Math.max(0, position - MAX_DISTANCE);
            const longest = Math.min(MAX_MATCH, data.length - position);
            let tries = 0;

            while (candidate >= 0 && candidate >= limit && tries < 32) {
                let length = 0;
                while (length < longest && data[candidate + length] === data[position + length]) {
                    length += 1;
                }
                if (length > bestLength) {
                    bestLength = length;
                    bestDistance = position - candidate;
                    if (length === longest) break;
                }
                candidate = previous[candidate] ?? -1;
                tries += 1;
            }

            previous[position] = head[hash] ?? -1;
            head[hash] = position;
        }

        if (bestLength >= MIN_MATCH) {
            writer.writeLength(bestLength);
            writer.writeDistance(bestDistance);
            // Every position the match covers is remembered, so that a later
            // match can reach back into it.
            for (let offset = 1; offset < bestLength; offset += 1) {
                const covered = position + offset;
                if (covered + MIN_MATCH > data.length) break;
                const hash = hashAt(covered);
                previous[covered] = head[hash] ?? -1;
                head[hash] = covered;
            }
            position += bestLength;
        } else {
            writer.writeLiteral(data[position] as number);
            position += 1;
        }
    }

    writer.writeSymbol(256); // The end of the block.
    return writer.finish();
}

/**
 * Writes a bit stream.
 *
 * The stream is written least-significant bit first, which is what the
 * format does for everything except the Huffman codes themselves: those are
 * written most-significant bit first.
 */
class BitWriter {
    /** The bytes written so far. */
    private readonly bytes: number[] = [];
    /** The bits that have not yet made a whole byte. */
    private pending = 0;
    /** How many bits are in `pending`. */
    private count = 0;

    /**
     * Write a number.
     *
     * @param value The number.
     * @param bits How many bits it is written with.
     */
    writeBits(value: number, bits: number): void {
        this.pending |= (value & ((1 << bits) - 1)) << this.count;
        this.count += bits;
        while (this.count >= 8) {
            this.bytes.push(this.pending & 0xff);
            this.pending >>>= 8;
            this.count -= 8;
        }
    }

    /**
     * Write a Huffman code, which is written most-significant bit first.
     *
     * @param code The code.
     * @param bits How many bits the code is written with.
     */
    writeCode(code: number, bits: number): void {
        for (let bit = bits - 1; bit >= 0; bit -= 1) {
            this.writeBits((code >>> bit) & 1, 1);
        }
    }

    /**
     * Write a literal byte.
     *
     * @param value The byte.
     */
    writeLiteral(value: number): void {
        this.writeSymbol(value);
    }

    /**
     * Write a literal or a length code.
     *
     * The fixed code table gives 7, 8 or 9 bits to each symbol, depending on
     * where the symbol falls.
     *
     * @param symbol The symbol.
     */
    writeSymbol(symbol: number): void {
        if (symbol <= 143) {
            this.writeCode(0x30 + symbol, 8);
        } else if (symbol <= 255) {
            this.writeCode(0x190 + symbol - 144, 9);
        } else if (symbol <= 279) {
            this.writeCode(symbol - 256, 7);
        } else {
            this.writeCode(0xc0 + symbol - 280, 8);
        }
    }

    /**
     * Write the length of a match.
     *
     * @param length The length, from three to 258.
     */
    writeLength(length: number): void {
        let index = 0;
        for (let candidate = 0; candidate < LENGTH_BASES.length; candidate += 1) {
            if ((LENGTH_BASES[candidate] as number) > length) break;
            index = candidate;
        }
        this.writeSymbol(257 + index);
        const extra = LENGTH_EXTRA_BITS[index] as number;
        if (extra > 0) this.writeBits(length - (LENGTH_BASES[index] as number), extra);
    }

    /**
     * Write the distance of a match.
     *
     * @param distance The distance, from one to 32768.
     */
    writeDistance(distance: number): void {
        let index = 0;
        for (let candidate = 0; candidate < DISTANCE_BASES.length; candidate += 1) {
            if ((DISTANCE_BASES[candidate] as number) > distance) break;
            index = candidate;
        }
        // The distances use a fixed five-bit code, written most-significant
        // bit first.
        this.writeCode(index, 5);
        const extra = DISTANCE_EXTRA_BITS[index] as number;
        if (extra > 0) this.writeBits(distance - (DISTANCE_BASES[index] as number), extra);
    }

    /**
     * Finish the stream.
     *
     * @returns The bytes written.
     */
    finish(): Uint8Array {
        if (this.count > 0) {
            this.bytes.push(this.pending & 0xff);
            this.pending = 0;
            this.count = 0;
        }
        return new Uint8Array(this.bytes);
    }
}

/**
 * The checksum the zlib format appends to its stream.
 *
 * @param data The uncompressed data.
 * @returns The checksum.
 */
function adler32(data: Uint8Array): number {
    let low = 1;
    let high = 0;
    for (const byte of data) {
        low = (low + byte) % 65521;
        high = (high + low) % 65521;
    }
    return ((high << 16) | low) >>> 0;
}

/**
 * The table the CRC-32 is computed with.
 */
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value;
    }
    return table;
})();

/**
 * The CRC-32 of a piece of data, as PNG defines it.
 *
 * @param data The data.
 * @returns The checksum.
 */
function crc32(data: Uint8Array): number {
    let crc = -1;
    for (const byte of data) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
    }
    return (crc ^ -1) >>> 0;
}

/**
 * Build a PNG chunk.
 *
 * @param type The chunk's four-character type.
 * @param data The chunk's contents.
 * @returns The chunk.
 */
function chunk(type: string, data: Uint8Array): Uint8Array {
    const body = concat([new TextEncoder().encode(type), data]);
    const output = new Uint8Array(12 + data.length);
    writeUint32(output, 0, data.length);
    output.set(body, 4);
    writeUint32(output, 8 + data.length, crc32(body));
    return output;
}

/**
 * Write a number as four bytes, most significant first.
 *
 * @param target The bytes to write into.
 * @param offset Where to write them.
 * @param value The number.
 */
function writeUint32(target: Uint8Array, offset: number, value: number): void {
    target[offset] = (value >>> 24) & 0xff;
    target[offset + 1] = (value >>> 16) & 0xff;
    target[offset + 2] = (value >>> 8) & 0xff;
    target[offset + 3] = value & 0xff;
}

/**
 * Join several byte arrays.
 *
 * @param parts The arrays.
 * @returns The joined array.
 */
function concat(parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}
