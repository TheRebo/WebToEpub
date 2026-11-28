/**
 * Package the extension into a signed-ready `.xpi`.
 *
 * An `.xpi` is a zip archive with a `manifest.json` at its root. Firefox will
 * install an unsigned `.xpi` temporarily, which is enough to try the build;
 * a permanent install needs a signature from addons.mozilla.org, which is
 * out of scope here.
 *
 * The archive is built with the same `zip.js` the extension uses at run time,
 * so packaging adds no new dependency to the toolchain.
 *
 * Usage:
 *   node tools/package.mjs            package the current build
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Uint8ArrayWriter, Uint8ArrayReader, ZipWriter, configure } from "@zip.js/zip.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const RELEASE = join(ROOT, "release");

/**
 * The timestamp every archive entry is stamped with.
 *
 * `zip.js` defaults `lastModDate` to the wall clock, which would make two
 * packages of the same source differ byte for byte — and a release artefact
 * that changes when you package it twice is not one anybody can verify.
 *
 * `SOURCE_DATE_EPOCH` is the reproducible-builds convention: a build system
 * sets it once, and every artefact honours it. When it is not set, a fixed
 * literal is used, so the default is still reproducible.
 *
 * @returns {Date} The timestamp to stamp the entries with.
 */
function entryTimestamp() {
    const epoch = process.env.SOURCE_DATE_EPOCH;
    if (epoch !== undefined && epoch.trim() !== "") {
        const seconds = Number(epoch);
        if (!Number.isFinite(seconds)) {
            throw new Error(`SOURCE_DATE_EPOCH is not a number: ${epoch}`);
        }
        return new Date(seconds * 1000);
    }
    return new Date("2020-01-01T00:00:00Z");
}

// The archive is built on the main thread: packaging is a one-shot developer
// action, and a worker pool would only add startup cost.
configure({ useWebWorkers: false });

/** Every file in a directory, as a path relative to it. */
async function walk(dir, base = dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...(await walk(path, base)));
        else found.push(relative(base, path));
    }
    return found;
}

/**
 * Write the archive.
 *
 * `manifest.json` is added first, because that is the convention the store
 * and the Firefox installer both expect, and a reader that streams the
 * archive can then find the manifest without reading the whole file.
 *
 * The entries are written from memory, with `bufferedWrite` on, so that the
 * compressed size and CRC of every entry are known when its local header is
 * written.
 *
 * This matters more than it looks. Handed a stream, `zip.js` cannot know an
 * entry's size up front, so it defers the size to a data descriptor after the
 * data and leaves the size field in the local header as zero. Firefox reads
 * the local header, not the central directory, so it finds a zero-sized
 * `manifest.json` and refuses the whole archive with `NS_ERROR_FILE_CORRUPTED`.
 * A sized reader plus buffered writes keeps the local headers self-contained,
 * which is the form Firefox — and every other ZIP reader — expects.
 */
async function packageExtension(files, outPath) {
    // `Uint8ArrayWriter` rather than `BlobWriter`: the archive has to end up
    // as bytes on disk, and a `Uint8Array` is exactly that.
    const sink = new Uint8ArrayWriter();
    const writer = new ZipWriter(sink, { bufferedWrite: true });

    const manifest = files.find((file) => file === "manifest.json");
    const ordered = manifest ? [manifest, ...files.filter((file) => file !== manifest)] : files;

    // Every entry gets the same timestamp, so the archive's bytes depend only
    // on its contents.
    const lastModDate = entryTimestamp();

    for (const file of ordered) {
        // The file is read into memory and handed over as a sized reader, so
        // that `zip.js` can write the entry's real size and CRC into its local
        // header instead of deferring them to a data descriptor.
        const data = await readFile(join(DIST, file));
        await writer.add(file, new Uint8ArrayReader(data), { level: 9, lastModDate });
    }

    await writer.close();
    await writeFile(outPath, sink.getData());
}

async function main() {
    console.log("\nPackaging Kintsugi…\n");

    try {
        await stat(DIST);
    } catch {
        throw new Error("There is no build to package. Run `npm run build` first.");
    }

    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(DIST, "manifest.json"), "utf8"));

    const files = (await walk(DIST)).sort();

    // A stale `.xpi` from an earlier version would otherwise stay on disk and
    // be published alongside the new one. The release directory is rebuilt
    // from scratch, so what is on disk afterwards is exactly what this run
    // produced.
    await rm(RELEASE, { recursive: true, force: true });

    const outDir = join(RELEASE, `kintsugi-${pkg.version}`);
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, `kintsugi-${pkg.version}.xpi`);
    await packageExtension(files, outPath);

    const { size } = await stat(outPath);
    console.log(`  manifest version: ${manifest.version}`);
    console.log(`  files:            ${files.length}`);
    console.log(`  artifact:         ${relative(ROOT, outPath)} (${(size / 1024).toFixed(1)} KB)`);
    console.log("\n  Package complete.\n");
}

main().catch((error) => {
    console.error("\n  Packaging failed:", error.message);
    process.exit(1);
});
