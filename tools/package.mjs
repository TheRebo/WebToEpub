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
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Uint8ArrayWriter, ZipWriter, configure } from "@zip.js/zip.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const RELEASE = join(ROOT, "release");

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
 */
async function packageExtension(files, outPath) {
    // `Uint8ArrayWriter` rather than `BlobWriter`: the archive has to end up
    // as bytes on disk, and a `Uint8Array` is exactly that.
    const sink = new Uint8ArrayWriter();
    const writer = new ZipWriter(sink);

    const manifest = files.find((file) => file === "manifest.json");
    const ordered = manifest ? [manifest, ...files.filter((file) => file !== manifest)] : files;

    for (const file of ordered) {
        // `zip.js` wants a web stream, and Node's file stream is not one.
        // `Response` is the bridge that needs no extra dependency.
        const body = new Response(createReadStream(join(DIST, file))).body;
        await writer.add(file, body, { level: 9 });
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
