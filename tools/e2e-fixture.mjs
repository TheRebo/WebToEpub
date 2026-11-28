/**
 * The end-to-end fixture site.
 *
 * A tiny HTTP server that stands in for a novel site, so the end-to-end checks
 * never touch the public internet. It serves:
 *
 *   /                a table of contents
 *   /chapter/<n>     a chapter, with a cover image and an author note
 *   /cover.png       a small placeholder cover, so the cover pipeline has
 *                    something real to fetch and the screenshots show a
 *                    cover rather than an empty frame
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

/**
 * A small placeholder cover, as an SVG.
 *
 * The cover used to be a 1×1 transparent PNG, which scaled to a blank frame
 * in every screenshot — the extension looked like it had failed to find a
 * cover. A real picture makes the screenshots honest.
 */
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a2f1c"/>
      <stop offset="1" stop-color="#1b1610"/>
    </linearGradient>
  </defs>
  <rect width="240" height="360" fill="url(#g)"/>
  <g fill="none" stroke="#d99224" stroke-width="3" stroke-linecap="round">
    <path d="M40 300 L96 120 L150 220 L200 90"/>
  </g>
  <text x="120" y="336" text-anchor="middle" font-family="Georgia,serif" font-size="18" fill="#e6dfd0">The Kintsugi Test Novel</text>
</svg>`;

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

/**
 * The table of contents.
 *
 * The chapter list is **built in the browser**, not in the markup the server
 * sends. The server sends an empty list and a script that fills it in — which
 * is how a great many novel sites work, and it is the reason the extension
 * has to read the page the user is looking at rather than only the bytes on
 * the wire.
 *
 * Making the fixture behave this way is deliberate: a fixture that served its
 * chapter list in the markup would pass whether the extension read the live
 * page or fetched it, and so would prove nothing about the behaviour that
 * matters.
 */
function tocPage() {
    const chapters = [];
    for (let index = 1; index <= CHAPTER_COUNT; index += 1) {
        chapters.push({ number: index, title: `Chapter ${index}: The ${ordinal(index)} Seal` });
    }
    const data = JSON.stringify(chapters).replace(/</g, "\\u003c");

    return shell(
        "The Kintsugi Test Novel",
        `<h1 class="title">The Kintsugi Test Novel</h1>
<p class="author">by A. Fixture</p>
<img class="cover" src="/cover.png" alt="Cover" width="120" height="180">
<div class="chapter-list-wrapper">
<h2>Chapters</h2>
<ul class="chapter-list"></ul>
</div>
<script>
(() => {
    const chapters = ${data};
    const list = document.querySelector("ul.chapter-list");
    for (const chapter of chapters) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = "/chapter/" + chapter.number;
        link.textContent = chapter.title;
        item.appendChild(link);
        list.appendChild(item);
    }
})();
</script>`,
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

        // A chapter that has moved, so a redirect is followed end to end.
        const moved = /^\/moved\/(\d+)$/.exec(path);
        if (moved) {
            response.writeHead(301, { location: `/chapter/${moved[1]}` });
            response.end();
            return;
        }

        // A page in a legacy encoding, so the declared charset is honoured.
        // The bytes are "中文" in GBK.
        if (path === "/gbk") {
            response.writeHead(200, { "content-type": "text/html; charset=gbk" });
            response.end(
                Buffer.concat([
                    Buffer.from("<!doctype html><html><head><title>"),
                    Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
                    Buffer.from("</title></head><body><p>"),
                    Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
                    Buffer.from("</p></body></html>"),
                ]),
            );
            return;
        }

        if (path === "/cover.png") {
            response.writeHead(200, {
                "content-type": "image/svg+xml",
                "cache-control": "no-store",
            });
            response.end(COVER);
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
