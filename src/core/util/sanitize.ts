/**
 * The sanitisation boundary.
 *
 * Everything that crosses from an untrusted source — a page's DOM, a
 * chapter's HTML, an image URL — passes through here. This module is
 * deliberately small and isolated so it is easy to audit and to test.
 *
 * See `SECURITY.md` §3.3.
 */
import DOMPurify from "../vendor/dompurify";
import { parseSrcset } from "./image-references";
import { stripIllegalXmlCharacters } from "./xml-characters";

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
    "picture",
    "pre",
    "q",
    "s",
    "small",
    "source",
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
    "media",
    "rowspan",
    "sizes",
    "span",
    "src",
    "srcset",
    "title",
    "type",
    "width",
];

/**
 * The `data:` media types that are safe to keep in an image's `src`.
 *
 * A `data:` URL carries its payload inline, so there is no network fetch and
 * no origin to check. The payload still has to be inert, though: an SVG is a
 * document, and an SVG document can carry a script. Everything else —
 * `text/html`, `application/xhtml+xml`, `image/svg+xml`, and any type that is
 * not on this list — is refused.
 *
 * The raster types are here because a chapter sometimes embeds a small
 * placeholder or an inline icon this way, and dropping the reference outright
 * would leave a broken image behind.
 */
const ALLOWED_DATA_MEDIA_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/bmp",
]);

/**
 * The media type of a `data:` URL.
 *
 * A `data:` URL is `data:<media type>[;base64],<payload>`. The media type is
 * optional and defaults to `text/plain`, and the parameters — `charset`, and
 * the `base64` flag — come before the comma.
 *
 * @param url The `data:` URL.
 * @returns The lower-cased media type, or an empty string when it cannot be
 *   read.
 */
function dataUrlMediaType(url: string): string {
    const comma = url.indexOf(",");
    const header = comma === -1 ? url.slice("data:".length) : url.slice("data:".length, comma);
    const mediaType = header.split(";")[0]?.trim().toLowerCase() ?? "";
    return mediaType;
}

/**
 * Whether a URL is a `data:` URL that may be kept.
 *
 * @param value The URL.
 * @returns Whether the URL is a `data:` URL with an allowed media type.
 */
function isAllowedDataUrl(value: string): boolean {
    if (!value.startsWith("data:")) return false;
    return ALLOWED_DATA_MEDIA_TYPES.has(dataUrlMediaType(value));
}

/**
 * Hook that strips dangerous URLs from `href`, `src` and `srcset`.
 *
 * DOMPurify removes most dangerous URLs on its own, but the allow-list
 * approach here means a URL that somehow survives the tag filter is still
 * checked.
 *
 * The `data:` case needs care. DOMPurify already refuses a `data:` URL in an
 * `href`, but it lets one through in an `src` — and `data:image/svg+xml` is
 * an SVG document, which can carry a script. The extension's own placeholder
 * images are SVG, so SVG cannot simply be banned: instead only the inert
 * raster types are allowed, and everything else is removed.
 *
 * A `srcset` is checked candidate by candidate. DOMPurify looks at the
 * attribute as a whole, so a list whose first candidate is harmless can carry
 * a dangerous one further along.
 */
function sanitiseHook(_domPurify: typeof DOMPurify): void {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
        const element = node as Element;
        for (const attribute of ["href", "src"]) {
            const value = element.getAttribute(attribute);
            if (value === null) continue;
            if (isUnsafeUrl(value)) element.removeAttribute(attribute);
        }

        const srcset = element.getAttribute("srcset");
        if (srcset === null) return;
        if (parseSrcset(srcset).some((candidate) => isUnsafeUrl(candidate.url))) {
            element.removeAttribute("srcset");
        }
    });
}

/**
 * Whether a URL is one that must not reach the book.
 *
 * @param value The URL.
 * @returns Whether the URL is dangerous.
 */
function isUnsafeUrl(value: string): boolean {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith("javascript:") || trimmed.startsWith("vbscript:")) return true;
    return trimmed.startsWith("data:") && !isAllowedDataUrl(trimmed);
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

    // The characters XML does not allow are removed before anything else, so
    // that one of them never reaches the extension's own data — and never
    // reaches the book, where it would make the whole file invalid.
    const withoutIllegalCharacters = stripIllegalXmlCharacters(html);

    let current = withoutIllegalCharacters;
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
 * Host names that always name the local machine or the local network.
 *
 * A site that names one of these in its table of contents would be using the
 * extension as a proxy into the user's own network — and, in the case of the
 * link-local range, into the cloud metadata service that hands out
 * credentials.
 */
const LOCAL_HOST_NAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/**
 * The private IPv4 ranges, as network addresses and prefix lengths.
 *
 * - `10/8`, `172.16/12` and `192.168/16` are the RFC 1918 private ranges.
 * - `169.254/16` is the link-local range, which includes the cloud metadata
 *   address `169.254.169.254`.
 * - `0/8` is the "this network" range.
 * - `100.64/10` is the carrier-grade NAT range.
 * - `127/8` is the loopback range.
 */
const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0a80000, 16],
];

/**
 * Whether an IPv4 address is in one of the private ranges.
 *
 * The address is compared as a number, because the dotted-quad forms that
 * name the same address — `127.0.0.1`, `0x7f000001`, `2130706433` — are all
 * normalised to the same value by the URL parser before they reach here.
 *
 * @param octets The four octets.
 * @returns Whether the address is private.
 */
function isPrivateIpv4(octets: number[]): boolean {
    const value =
        ((octets[0] as number) << 24) +
        ((octets[1] as number) << 16) +
        ((octets[2] as number) << 8) +
        (octets[3] as number);

    for (const [network, bits] of PRIVATE_IPV4_RANGES) {
        // The mask keeps the network's own bits and drops the host's.
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        if ((value & mask) >>> 0 === network) return true;
    }
    return false;
}

/**
 * Expand an IPv6 address into its eight 16-bit groups.
 *
 * The address arrives from the URL parser in its canonical, compressed form:
 * `::ffff:7f00:1` rather than `::ffff:127.0.0.1`. The embedded IPv4 address is
 * therefore in *hexadecimal*, and a test written against the dotted-quad
 * spelling would never match — which is exactly the sort of thing that turns
 * into an SSRF hole.
 *
 * @param address The address, without its brackets.
 * @returns The eight groups, or `null` if the address is not an IPv6 address.
 */
function expandIpv6(address: string): number[] | null {
    let text = address.toLowerCase();

    // The IPv4 tail, if the address has one. It is two groups, and it is
    // rewritten into hexadecimal so that the rest of the address can be read
    // one group at a time.
    const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
    if (dotted) {
        const octets = (dotted[1] as string).split(".").map(Number);
        if (octets.some((octet) => octet > 255)) return null;
        const high = ((octets[0] as number) << 8) + (octets[1] as number);
        const low = ((octets[2] as number) << 8) + (octets[3] as number);
        text = `${text.slice(0, dotted.index)}${high.toString(16)}:${low.toString(16)}`;
    }

    const halves = text.split("::");
    if (halves.length > 2) return null;

    const parse = (part: string): number[] | null => {
        if (part === "") return [];
        const groups: number[] = [];
        for (const group of part.split(":")) {
            if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
            groups.push(parseInt(group, 16));
        }
        return groups;
    };

    const head = parse(halves[0] as string);
    const rear = halves.length === 2 ? parse(halves[1] as string) : [];
    if (!head || !rear) return null;

    // The address has no `::`, so it must already have all eight groups.
    if (halves.length === 1) return head.length === 8 ? head : null;

    // The `::` stands for however many groups are missing, and they go in the
    // middle — between the groups before it and the groups after it.
    const missing = 8 - head.length - rear.length;
    if (missing < 1) return null;

    return [...head, ...new Array<number>(missing).fill(0), ...rear];
}

/**
 * Whether an IPv6 address is loopback, unique-local or link-local.
 *
 * @param address The address, without its brackets.
 * @returns Whether the address is private.
 */
function isPrivateIpv6(address: string): boolean {
    const normalised = address.toLowerCase();

    // `::1` — the loopback address.
    if (normalised === "::1") return true;

    // The unspecified address, `::`.
    if (normalised === "::") return true;

    const groups = expandIpv6(normalised);
    if (!groups) return false;

    // `::ffff:0:0/96` — IPv4-mapped addresses, and `::/96` — IPv4-compatible
    // addresses. Both carry a whole IPv4 address in their last four bytes, and
    // the URL parser has already rewritten it into hexadecimal, so it is read
    // back out of the groups rather than out of the text.
    const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    const isCompatible = groups.slice(0, 6).every((group) => group === 0) && groups[6] !== 0;
    if (isMapped || isCompatible) {
        const octets = [
            (groups[6] as number) >> 8,
            (groups[6] as number) & 0xff,
            (groups[7] as number) >> 8,
            (groups[7] as number) & 0xff,
        ];
        return isPrivateIpv4(octets);
    }

    // `fc00::/7` — unique local addresses.
    if (((groups[0] as number) & 0xfe00) === 0xfc00) return true;

    // `fe80::/10` — link-local addresses.
    if (((groups[0] as number) & 0xffc0) === 0xfe80) return true;

    // `ff00::/8` — multicast.
    if (((groups[0] as number) & 0xff00) === 0xff00) return true;

    return false;
}

/**
 * Whether a host name names the local machine or the local network.
 *
 * The host is compared after the URL parser has normalised it, so the
 * decimal, hexadecimal and octal spellings of an IPv4 address all arrive
 * here in their canonical dotted-quad form.
 *
 * @param hostname The host name.
 * @returns Whether the host is private.
 */
export function isPrivateHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");

    if (LOCAL_HOST_NAMES.has(host)) return true;

    // `.localhost` is reserved for the loopback, and `.local` is the
    // mDNS suffix that resolves onto the local network.
    if (host.endsWith(".localhost") || host.endsWith(".local")) return true;

    // An IPv6 address arrives wrapped in brackets.
    if (host.startsWith("[") && host.endsWith("]")) {
        return isPrivateIpv6(host.slice(1, -1));
    }

    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
        const octets = ipv4.slice(1, 5).map(Number);
        if (octets.some((octet) => octet > 255)) return false;
        return isPrivateIpv4(octets);
    }

    // A bare IPv6 address without brackets.
    if (host.includes(":")) return isPrivateIpv6(host);

    return false;
}

/**
 * How a URL is judged before it is fetched.
 */
export interface FetchValidationOptions {
    /**
     * Whether a URL that names a private address may be fetched.
     *
     * This is never set from a URL that came out of a page. It is set by the
     * caller that has already established that the *user* asked for that host
     * — see {@link mayFetchUrl} in `core/net/fetch-policy.ts` for the rule that
     * decides.
     */
    allowPrivate?: boolean;
}

/**
 * Validate a URL before it is fetched.
 *
 * Rejects anything that is not an absolute `http:` or `https:` URL, and —
 * unless the caller has established that the user asked for that host —
 * anything that names the local machine or a private network.
 *
 * The host check is the second half of the defence. The scheme check stops
 * the obvious — a `file:` URL, a `data:` URL — but a site can name a private
 * address just as easily, and the extension fetches from its own privileged
 * context, where it can reach further than the page that asked. Without this
 * check, a site whose table of contents links to
 * `http://169.254.169.254/latest/meta-data/` would have its response read
 * into the extension and packaged into the book.
 *
 * @param url The URL to validate.
 * @param options How to judge it.
 * @returns The parsed URL, or `null` when it must not be fetched.
 */
export function validateFetchableUrl(
    url: string,
    options: FetchValidationOptions = {},
): URL | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null;
    if (!options.allowPrivate && isPrivateHost(parsed.hostname)) return null;
    return parsed;
}

/**
 * Validate an origin before it is used in a host permission.
 *
 * A host permission is written as an origin pattern, and the pattern is built
 * by pasting the origin into `https://example.com/*`. An origin that is not
 * a plain `http:` or `https:` host — one that carries a path, a query, a
 * fragment, credentials, or a wildcard of its own — would produce a pattern
 * that grants more than the user was shown.
 *
 * @param origin The origin to validate.
 * @returns The origin, normalised, or `null` when it is not a plain host.
 */
export function validateOrigin(origin: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(origin);
    } catch {
        return null;
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null;

    // An origin is a scheme, a host and a port. Anything more is a URL that
    // happens to parse, and pasting it into a permission pattern would be
    // meaningless at best.
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    if (parsed.search !== "" || parsed.hash !== "") return null;
    if (parsed.username !== "" || parsed.password !== "") return null;

    // A wildcard host parses, and would turn into a pattern that grants
    // access to every host on the scheme. Only a real host name is allowed.
    if (parsed.hostname === "" || parsed.hostname.includes("*")) return null;

    return parsed.origin;
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
