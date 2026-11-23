/**
 * Kintsugi build script.
 *
 * Produces a loadable Firefox extension in `dist/`:
 *
 *   dist/
 *     manifest.json
 *     workbench.html  popup.html  options.html  onboarding.html
 *     assets/…        (bundles, styles, icons)
 *     _locales/…
 *
 * Everything under `src/` is bundled with esbuild. Nothing is fetched from
 * the network at build time or at run time.
 *
 * Usage:
 *   node tools/build.mjs           production build
 *   node tools/build.mjs --dev     development build (no minify, sourcemaps)
 */
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

const isDev = process.argv.includes("--dev");

/** The entry points that produce an extension page. */
const PAGES = [
    { name: "workbench", title: "Kintsugi — Workbench" },
    { name: "popup", title: "Kintsugi" },
    { name: "options", title: "Kintsugi — Settings" },
    { name: "onboarding", title: "Welcome to Kintsugi" },
];

/**
 * The manifest is generated rather than hand-written, so that the version,
 * the permission set, and the CSP live in exactly one place and cannot drift
 * between the source tree and the built artifact.
 */
async function buildManifest() {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

    const manifest = {
        manifest_version: 3,
        name: "Kintsugi",
        version: pkg.version,
        description:
            "Turn any web novel into a book worth keeping. Point Kintsugi at a chapter list and it builds a clean EPUB — cover, table of contents, and all.",
        default_locale: "en",

        icons: {
            48: "assets/icons/icon-48.png",
            96: "assets/icons/icon-96.png",
            128: "assets/icons/icon-128.png",
        },

        permissions: ["downloads", "scripting", "storage", "declarativeNetRequest", "cookies"],
        host_permissions: [],
        optional_host_permissions: ["*://*/*"],

        action: {
            default_title: "Kintsugi",
            default_icon: {
                16: "assets/icons/icon-16.png",
                32: "assets/icons/icon-32.png",
                48: "assets/icons/icon-48.png",
            },
            default_popup: "popup.html",
        },

        background: {
            scripts: ["assets/background.js"],
            type: "module",
        },

        content_scripts: [
            {
                matches: ["<all_urls>"],
                js: ["assets/content-script.js"],
                run_at: "document_idle",
                all_frames: false,
            },
        ],

        web_accessible_resources: [
            {
                resources: ["assets/*"],
                matches: ["<all_urls>"],
            },
        ],

        content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
        },

        incognito: "spanning",

        browser_specific_settings: {
            gecko: {
                id: "kintsugi@localhost",
                data_collection_permissions: { required: ["none"], optional: [] },
                strict_min_version: "140.0",
            },
        },
    };

    await writeFile(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    return manifest;
}

/** Recursively copy a directory. */
async function copyDir(from, to) {
    if (!existsSync(from)) return;
    await cp(from, to, { recursive: true });
}

/**
 * Bundle every TypeScript entry point.
 *
 * Each page gets its own bundle so the popup stays small: it must open
 * instantly, and it has no business shipping the EPUB pipeline.
 */
async function bundleScripts() {
    const entryPoints = {
        background: join(SRC, "core", "background.ts"),
        "content-script": join(SRC, "core", "content-script.ts"),
        workbench: join(SRC, "ui", "pages", "workbench.ts"),
        popup: join(SRC, "ui", "pages", "popup.ts"),
        options: join(SRC, "ui", "pages", "options.ts"),
        onboarding: join(SRC, "ui", "pages", "onboarding.ts"),
    };

    for (const [name, entry] of Object.entries(entryPoints)) {
        if (!existsSync(entry)) {
            throw new Error(`Missing entry point: ${relative(ROOT, entry)}`);
        }
    }

    await build({
        entryPoints,
        outdir: join(DIST, "assets"),
        bundle: true,
        format: "esm",
        target: ["firefox140"],
        platform: "browser",
        splitting: true,
        chunkNames: "chunks/[name]-[hash]",
        assetNames: "[name]-[hash]",
        entryNames: "[name]",
        minify: !isDev,
        sourcemap: isDev ? "inline" : false,
        legalComments: "none",
        logLevel: "info",
        define: {
            "process.env.NODE_ENV": JSON.stringify(isDev ? "development" : "production"),
        },
        loader: {
            ".svg": "dataurl",
            ".png": "dataurl",
        },
    });
}

/**
 * Bundle the CSS.
 *
 * The design system's token files and base styles are shared by every page;
 * each page's own styles are concatenated after them so a page can override
 * a token without editing the shared file.
 */
async function bundleStyles() {
    const shared = [join(SRC, "ui", "styles", "tokens.css"), join(SRC, "ui", "styles", "base.css")];

    const pages = [
        { name: "workbench", dir: join(SRC, "ui", "pages", "workbench") },
        { name: "popup", dir: join(SRC, "ui", "pages", "popup") },
        { name: "options", dir: join(SRC, "ui", "pages", "options") },
        { name: "onboarding", dir: join(SRC, "ui", "pages", "onboarding") },
    ];

    const outDir = join(DIST, "assets", "styles");
    await mkdir(outDir, { recursive: true });

    for (const page of pages) {
        const parts = [...shared];
        if (existsSync(page.dir)) {
            for (const file of (await readdir(page.dir)).sort()) {
                if (file.endsWith(".css")) parts.push(join(page.dir, file));
            }
        }
        const chunks = [];
        for (const part of parts) {
            if (!existsSync(part)) continue;
            chunks.push(`/* ${relative(SRC, part)} */\n${await readFile(part, "utf8")}`);
        }
        await writeFile(join(outDir, `${page.name}.css`), chunks.join("\n\n"));
    }
}

/** Generate the HTML for each extension page. */
async function buildPages() {
    for (const page of PAGES) {
        const html = `<!doctype html>
<html lang="en" data-theme="light">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${page.title}</title>
        <link rel="stylesheet" href="assets/styles/${page.name}.css" />
    </head>
    <body class="k-page k-page--${page.name}">
        <script type="module" src="assets/${page.name}.js"></script>
    </body>
</html>
`;
        await writeFile(join(DIST, `${page.name}.html`), html);
    }
}

/** Copy the static assets: locales and icons. */
async function copyStatic() {
    await copyDir(join(SRC, "_locales"), join(DIST, "_locales"));
    await copyDir(join(SRC, "assets", "icons"), join(DIST, "assets", "icons"));
}

/** Report the size of the build. */
async function reportSize() {
    async function dirSize(dir) {
        let total = 0;
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) total += await dirSize(path);
            else total += (await stat(path)).size;
        }
        return total;
    }
    const bytes = await dirSize(DIST);
    console.log(`\n  dist/ is ${(bytes / 1024).toFixed(1)} KB uncompressed`);
}

async function main() {
    console.log(`\nBuilding Kintsugi${isDev ? " (development)" : ""}…\n`);
    await rm(DIST, { recursive: true, force: true });
    await mkdir(DIST, { recursive: true });

    await buildManifest();
    await bundleScripts();
    await bundleStyles();
    await buildPages();
    await copyStatic();

    await reportSize();
    console.log("\n  Build complete.\n");
}

main().catch((error) => {
    console.error("\n  Build failed:", error.message);
    process.exit(1);
});
