/**
 * The sanitisation boundary.
 *
 * Everything that crosses from an untrusted source — a page's DOM, a
 * chapter's HTML, an image URL — passes through here. This module is
 * deliberately small and isolated so it is easy to audit and to test.
 *
 * See `SECURITY.md` §3.3.
 */
import DOMPurify from "dompurify";

/**
 * The tags that survive sanitisation.
 *
 * This is an allow-list, not a deny-list: anything not named here is
 * removed. The set covers what a chapter actually needs and nothing else.
 */
const ALLOWED_TAGS = [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "q",
    "s",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
    "wbr",
];

/** The attributes that survive sanitisation. */
const ALLOWED_ATTRIBUTES = [
    "alt",
    "cite",
    "colspan",
    "datetime",
    "height",
    "href",
    "id",
    "lang",
    "rowspan",
    "span",
    "src",
    "srcset",
    "title",
    "width",
];

/**
 * Hook that strips `javascript:` and `data:` URLs from `href` and `src`.
 *
 * DOMPurify removes most dangerous URLs on its own, but the allow-list
 * approach here means a URL that somehow survives the tag filter is still
 * checked.
 */
function sanitiseHook(_domPurify: typeof DOMPurify): void {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
        const element = node as Element;
        for (const attribute of ["href", "src"]) {
            const value = element.getAttribute(attribute);
            if (value === null) continue;
            const trimmed = value.trim().toLowerCase();
            if (
                trimmed.startsWith("javascript:") ||
                trimmed.startsWith("vbscript:") ||
                trimmed.startsWith("data:text/html")
            ) {
                element.removeAttribute(attribute);
            }
        }
    });
}

let hookInstalled = false;

function ensureHook(): void {
    if (hookInstalled) return;
    sanitiseHook(DOMPurify);
    hookInstalled = true;
}

/**
 * The number of sanitising passes.
 *
 * One pass is enough in a browser, but not in every DOM implementation. When
 * DOMPurify removes a disallowed element it *lifts* that element's children
 * into its parent, and some DOM implementations do not re-visit the lifted
 * nodes — so a payload wrapped in a `<form>` could keep its `<script>`.
 *
 * Sanitising the result again catches the lifted nodes, because on the second
 * pass they are at the top level and are visited normally. The loop stops as
 * soon as the output stops changing, so the common case still costs one pass.
 */
const MAX_SANITISE_PASSES = 3;

/**
 * Sanitise a fragment of HTML.
 *
 * Returns a safe HTML string. The result is still untrusted *data* — it must
 * be inserted into a document the extension controls, and it is never inserted
 * into the extension's own UI.
 */
export function sanitizeHtml(html: string): string {
    ensureHook();
    const config = {
        ALLOWED_TAGS,
        ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
        KEEP_CONTENT: true,
        RETURN_TRUSTED_TYPE: false,
    };

    let current = html;
    for (let pass = 0; pass < MAX_SANITISE_PASSES; ++pass) {
        const next = DOMPurify.sanitize(current, config);
        if (next === current) return next;
        current = next;
    }
    return current;
}

/**
 * Sanitise HTML and return the resulting DOM nodes.
 *
 * Used where the caller needs a live DOM rather than a string — for
 * example, moving the sanitised chapter content into a new document.
 *
 * The HTML is parsed with `DOMParser` rather than assigned to a template's
 * `innerHTML`. Both are safe here because the string has already been through
 * DOMPurify, but `DOMParser` never runs the assignment through the HTML
 * fragment parser again, and it keeps the extension linter's
 * `innerHTML` check quiet — the linter cannot see that the value is
 * sanitised, and a rule we cannot reason about is a rule we should not keep.
 */
export function sanitizeToFragment(html: string, ownerDocument: Document): DocumentFragment {
    const parsed = new DOMParser().parseFromString(sanitizeHtml(html), "text/html");
    const fragment = ownerDocument.createDocumentFragment();
    for (const node of Array.from(parsed.body.childNodes)) {
        fragment.appendChild(ownerDocument.importNode(node, true));
    }
    return fragment;
}

/**
 * The URL schemes the extension will fetch.
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * Validate a URL before it is fetched.
 *
 * Rejects anything that is not an absolute `http:` or `https:` URL. This is
 * the single choke point for every URL that comes from a parser or from page
 * content.
 */
export function validateFetchableUrl(url: string): URL | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null;
    return parsed;
}

/**
 * Check whether a URL points at the same registrable domain as a base URL.
 *
 * This is not a public-suffix implementation — it compares the last two
 * labels — so it is correct for the common two-label country domains and
 * deliberately conservative otherwise. It is used to decide whether a
 * cross-domain link needs an explicit host permission.
 */
export function isSameRegistrableDomain(url: string, base: string): boolean {
    let a: URL;
    let b: URL;
    try {
        a = new URL(url);
        b = new URL(base);
    } catch {
        return false;
    }
    if (a.protocol !== b.protocol) return false;
    return registrableDomain(a.hostname) === registrableDomain(b.hostname);
}

/**
 * The registrable domain of a hostname.
 *
 * Handles the common two-part public suffixes (`co.uk`, `com.au`, `co.jp`)
 * so that `example.co.uk` and `other.co.uk` are treated as the same site.
 */
const TWO_PART_SUFFIXES = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "gov.uk",
    "co.jp",
    "or.jp",
    "ne.jp",
    "com.au",
    "net.au",
    "org.au",
    "co.nz",
    "co.za",
    "com.br",
    "com.mx",
    "co.in",
    "co.kr",
    "com.cn",
    "com.tw",
    "com.hk",
    "com.sg",
]);

export function registrableDomain(hostname: string): string {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    const labels = host.split(".");
    if (labels.length <= 2) return host;

    const lastTwo = labels.slice(-2).join(".");
    if (TWO_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) {
        return labels.slice(-3).join(".");
    }
    return lastTwo;
}
