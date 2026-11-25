/**
 * Dump the ZIP local headers of a file, so the extra fields can be seen.
 *
 * A development tool: it prints the local header of every entry, which is
 * where the `mimetype` entry's problem shows up.
 *
 * Usage: node tools/dump-zip.mjs <file.zip>
 */
import { readFile } from "node:fs/promises";

const path = process.argv[2];
const bytes = await readFile(path);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Read a little-endian unsigned 16-bit value. */
const u16 = (offset) => view.getUint16(offset, true);
/** Read a little-endian unsigned 32-bit value. */
const u32 = (offset) => view.getUint32(offset, true);

let offset = 0;
while (offset < bytes.length - 4) {
    if (u32(offset) !== 0x04034b50) break;

    const flags = u16(offset + 6);
    const method = u16(offset + 8);
    const compressedSize = u32(offset + 18);
    const nameLength = u16(offset + 26);
    const extraLength = u16(offset + 28);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const extra = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + extraLength);

    console.log(
        `entry: ${name} method=${method} flags=0x${flags.toString(16)} ` +
            `extraLength=${extraLength} compressedSize=${compressedSize}`,
    );
    if (extraLength > 0) {
        console.log(`  extra bytes: ${Buffer.from(extra).toString("hex")}`);
        let cursor = 0;
        while (cursor + 4 <= extra.length) {
            const id = extra[cursor] | (extra[cursor + 1] << 8);
            const size = extra[cursor + 2] | (extra[cursor + 3] << 8);
            console.log(`  extra field id=0x${id.toString(16)} size=${size}`);
            cursor += 4 + size;
        }
    }

    offset += 30 + nameLength + extraLength + compressedSize;
}
