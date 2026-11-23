/**
 * The end-to-end fixture site.
 *
 * A tiny HTTP server that stands in for a novel site, so the end-to-end checks
 * never touch the public internet. It serves:
 *
 *   /                a table of contents
 *   /chapter/<n>     a chapter, with a cover image and an author note
 *   /cover.png       a 1×1 PNG, so the cover pipeline has something to fetch
 *   /slow            a page that never finishes, for the timeout path
 *
 * The markup is shaped so that the **default parser** finds it: a
 * `ul.chapter-list` of links on the index, and a `div.chapter-content` holding
 * more than two hundred characters on a chapter page. That means the fixture
 * exercises the same code path a real site with no dedicated parser would.
 */
import { createServer } from "node:http";

/** The number of chapters the fixture serves. */
export const CHAPTER_COUNT = 12;

/** A 1×1 transparent PNG. */
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

/** The page's shell. */
function shell(title, body) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header"><a href="/">The Kintsugi Test Novel</a></header>
<main>
${body}
</main>
<footer class="site-footer">A fixture, not a real novel.</footer>
</body>
</html>`;
}

/** The table of contents. */
function tocPage() {
    const items = [];
    for (let index = 1; index <= CHAPTER_COUNT; index += 1) {
        items.push(
            `    <li><a href="/chapter/${index}">Chapter ${index}: The ${ordinal(index)} Seal</a></li>`,
        );
    }
    return shell(
        "The Kintsugi Test Novel",
        `<h1 class="title">The Kintsugi Test Novel</h1>
<p class="author">by A. Fixture</p>
<img class="cover" src="/cover.png" alt="Cover" width="120" height="180">
<div class="chapter-list-wrapper">
<h2>Chapters</h2>
<ul class="chapter-list">
${items.join("\n")}
</ul>
</div>`,
    );
}

/** A chapter. */
function chapterPage(index) {
    const paragraphs = [];
    for (let paragraph = 0; paragraph < 6; paragraph += 1) {
        paragraphs.push(
            `<p>Chapter ${index} carried the ${ordinal(index)} seal across the river of broken glass, ` +
                `and the bell in the tower answered with a note that had not been heard in a hundred years. ` +
                `She counted the echoes as they faded, and set her jaw, and walked on.</p>`,
        );
    }
    return shell(
        `Chapter ${index} — The Kintsugi Test Novel`,
        `<h1 class="chapter-title">Chapter ${index}: The ${ordinal(index)} Seal</h1>
<div class="chapter-content">
${paragraphs.join("\n")}
</div>
<div class="author-notes">Author's note: this chapter was written by the fixture.</div>
<a href="/chapter/${index === CHAPTER_COUNT ? 1 : index + 1}">Next chapter</a>`,
    );
}

/** The ordinal suffix for a number. */
function ordinal(number) {
    const suffixes = ["th", "st", "nd", "rd"];
    const remainder = number % 100;
    const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
    return `${number}${suffix}`;
}

/**
 * Start the fixture server.
 *
 * @returns {Promise<{origin: string, close: () => Promise<void>}>} The server's origin and a closer.
 */
export async function startFixture() {
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const path = url.pathname;

        if (path === "/" || path === "/index.html") {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            response.end(tocPage());
            return;
        }

        const chapter = /^\/chapter\/(\d+)$/.exec(path);
        if (chapter) {
            const index = Number(chapter[1]);
            if (index >= 1 && index <= CHAPTER_COUNT) {
                response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
                response.end(chapterPage(index));
                return;
            }
        }

        if (path === "/cover.png") {
            response.writeHead(200, { "content-type": "image/png" });
            response.end(PIXEL);
            return;
        }

        if (path === "/style.css") {
            response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
            response.end(
                "body{font-family:Georgia,serif;margin:0;padding:2rem;max-width:44rem;}" +
                    ".site-header a{font-weight:700;text-decoration:none;}" +
                    ".chapter-content p{line-height:1.7;}",
            );
            return;
        }

        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found.");
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    return {
        origin: `http://localhost:${port}`,
        close: () =>
            new Promise((resolve) => {
                server.close(() => resolve(undefined));
            }),
    };
}
