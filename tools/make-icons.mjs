/**
 * The icon generator.
 *
 * The extension's icon is the kintsugi mark: a vessel split into two pieces
 * with a gold seam running down the middle. It is the same shape the UI
 * uses in its header, so the toolbar icon and the popup wordmark are
 * visibly the same product.
 *
 * The icon is rasterised here rather than by a browser or an image library.
 * The mark is a handful of rectangles and a polyline, and a PNG encoder is
 * about forty lines of `zlib` and CRC arithmetic. Adding Playwright or
 * `sharp` to the toolchain to draw five icons would be a poor trade: it
 * would make the build depend on a browser download for a step that takes
 * a millisecond.
 *
 * Usage:
 *   node tools/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "assets", "icons");

/** The sizes the manifest and the toolbar need. */
const SIZES = [16, 32, 48, 96, 128];

/** The colours, as `[r, g, b, a]`. */
const COLORS = {
    /** The vessel's body, which is also the app's dark background. */
    vessel: [26, 23, 19, 255],
    /** The gold of the seam. */
    gold: [237, 180, 74, 255],
    /** The lighter fill of the vessel, so the mark reads at 16 px. */
    fill: [250, 248, 244, 255],
};

/**
 * Draw the mark into a pixel buffer.
 *
 * The geometry is described on a 128-unit grid and scaled to the target
 * size, so every size gets the same proportions.
 */
function drawMark(size) {
    const pixels = new Uint8Array(size * size * 4);
    const scale = size / 128;

    const put = (x, y, colour) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const index = (y * size + x) * 4;
        pixels[index] = colour[0];
        pixels[index + 1] = colour[1];
        pixels[index + 2] = colour[2];
        pixels[index + 3] = colour[3];
    };

    // --- The rounded background ---
    const radius = size >= 48 ? 28 : 20;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            if (!insideRoundedRect(x, y, size, size, radius)) continue;
            put(x, y, COLORS.vessel);
        }
    }

    // --- The two halves of the vessel ---
    const left = Math.round(38 * scale);
    const right = Math.round(90 * scale);
    const top = Math.round(26 * scale);
    const bottom = Math.round(102 * scale);
    const middle = Math.round(64 * scale);

    for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < middle; x += 1) put(x, y, COLORS.fill);
        for (let x = middle; x < right; x += 1) put(x, y, COLORS.fill);
    }

    // --- The gold seam ---
    // A polyline that wanders down the middle, drawn with a round stroke.
    const seam = [
        [64, 26],
        [60, 44],
        [68, 58],
        [60, 74],
        [68, 88],
        [64, 102],
    ].map(([x, y]) => [x * scale, y * scale]);

    const thickness = Math.max(1.5, 7 * scale);
    const radiusHalf = thickness / 2;

    for (let index = 0; index < seam.length - 1; index += 1) {
        const [x1, y1] = seam[index];
        const [x2, y2] = seam[index + 1];
        const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
        for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const cx = x1 + (x2 - x1) * t;
            const cy = y1 + (y2 - y1) * t;
            for (let dy = -Math.ceil(radiusHalf); dy <= Math.ceil(radiusHalf); dy += 1) {
                for (let dx = -Math.ceil(radiusHalf); dx <= Math.ceil(radiusHalf); dx += 1) {
                    if (dx * dx + dy * dy > radiusHalf * radiusHalf) continue;
                    put(Math.round(cx + dx), Math.round(cy + dy), COLORS.gold);
                }
            }
        }
    }

    return pixels;
}

/** Whether a point is inside a rounded rectangle. */
function insideRoundedRect(x, y, width, height, radius) {
    const dx = Math.max(radius - x, 0, x - (width - radius - 1));
    const dy = Math.max(radius - y, 0, y - (height - radius - 1));
    return dx * dx + dy * dy <= radius * radius;
}

/**
 * Encode a pixel buffer as a PNG.
 *
 * The PNG is written by hand: an IHDR, an IDAT holding the zlib-deflated
 * scanlines, and an IEND. Every chunk is length-prefixed and CRC-checked.
 */
function encodePng(pixels, size) {
    // Each scanline is prefixed with a filter byte. Filter 0 (none) is
    // used: the image is small, and the zlib deflate does the work.
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y += 1) {
        const rowStart = y * (size * 4 + 1);
        raw[rowStart] = 0;
        Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, rowStart + 1);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // The bit depth.
    ihdr[9] = 6; // The colour type: truecolour with alpha.
    ihdr[10] = 0; // The compression method.
    ihdr[11] = 0; // The filter method.
    ihdr[12] = 0; // The interlace method.

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** Build a PNG chunk. */
function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([length, body, crc]);
}

/** The CRC-32 of a buffer, as PNG defines it. */
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c;
    }
    return table;
})();

/** The CRC-32 of a buffer. */
function crc32(buffer) {
    let crc = -1;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ -1;
}

async function main() {
    await mkdir(OUT, { recursive: true });

    for (const size of SIZES) {
        const pixels = drawMark(size);
        await writeFile(join(OUT, `icon-${size}.png`), encodePng(pixels, size));
    }

    console.log(`  ${SIZES.length} icons written to src/assets/icons/.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
