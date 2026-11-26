import { describe, expect, it } from "vitest";
import {
    isPrivateHost,
    isSameRegistrableDomain,
    registrableDomain,
    sanitizeHtml,
    sanitizeToFragment,
    validateFetchableUrl,
    validateOrigin,
} from "../../src/core/util/sanitize";

describe("sanitizeHtml", () => {
    it("keeps the markup a chapter needs", () => {
        const html = sanitizeHtml('<p class="x">Hello <em>world</em></p>');
        expect(html).toContain("<p");
        expect(html).toContain("<em>world</em>");
    });

    it("removes a script", () => {
        const html = sanitizeHtml('<p>ok</p><script>alert("x")</script>');
        expect(html).not.toContain("script");
        expect(html).toContain("ok");
    });

    it("removes an event handler attribute", () => {
        const html = sanitizeHtml('<p onclick="steal()">ok</p>');
        expect(html).not.toContain("onclick");
    });

    it("removes a javascript: URL", () => {
        const html = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
        expect(html).not.toContain("javascript:");
    });

    it("removes an iframe", () => {
        const html = sanitizeHtml('<iframe src="https://evil.example"></iframe><p>ok</p>');
        expect(html).not.toContain("iframe");
    });

    it("removes a tag that is not on the allow-list", () => {
        const html = sanitizeHtml("<form><input name='x'><p>ok</p></form>");
        expect(html).not.toContain("<form");
        expect(html).not.toContain("<input");
        expect(html).toContain("ok");
    });

    it("removes a payload that is wrapped in a disallowed element", () => {
        // DOMPurify lifts a disallowed element's children into its parent.
        // Some DOM implementations do not revisit the lifted nodes, so the
        // sanitiser runs until the output stops changing.
        expect(sanitizeHtml("<form><script>alert(1)</script></form>")).not.toContain("script");
        expect(sanitizeHtml("<form><img src=x onerror=alert(1)></form>")).not.toContain("onerror");
        expect(sanitizeHtml("<form><svg onload=alert(1)></svg></form>")).not.toContain("svg");
        expect(
            sanitizeHtml("<form><iframe src=javascript:alert(1)></iframe></form>"),
        ).not.toContain("iframe");
        expect(sanitizeHtml("<form><a href=javascript:alert(1)>x</a></form>")).not.toContain(
            "javascript:",
        );
        expect(sanitizeHtml("<form><button onclick=alert(1)>x</button></form>")).not.toContain(
            "onclick",
        );
    });

    it("keeps the text of a removed tag", () => {
        expect(sanitizeHtml("<marquee>still here</marquee>")).toContain("still here");
    });

    it("is stable when applied twice", () => {
        const once = sanitizeHtml('<p class="x">Hello <em>world</em></p>');
        expect(sanitizeHtml(once)).toBe(once);
    });

    it("removes a data: URL that can carry a document", () => {
        // An SVG is a document, and an SVG document can carry a script. It is
        // the one image type the extension builds itself, so it cannot simply
        // be banned — but it must not survive in a chapter either.
        const svg = sanitizeHtml(
            "<img src=\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>\">",
        );
        expect(svg).not.toContain("data:image/svg+xml");
        expect(svg).not.toContain("onload");
    });

    it("removes a base64 data: URL that can carry a document", () => {
        const svg = sanitizeHtml(
            '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
        );
        expect(svg).not.toContain("data:image/svg+xml");
    });

    it("removes a data: URL with a document media type", () => {
        expect(sanitizeHtml('<img src="data:text/html,<script>x</script>">')).not.toContain(
            "data:",
        );
        expect(sanitizeHtml('<img src="data:application/xhtml+xml,<html/>">')).not.toContain(
            "data:",
        );
    });

    it("removes a data: URL with no media type at all", () => {
        // The default media type is `text/plain`, which is not an image, so
        // the reference is dropped rather than left pointing at nothing.
        expect(sanitizeHtml('<img src="data:,hello">')).not.toContain("data:");
    });

    it("keeps a data: URL for an inert raster image", () => {
        const png = sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=">');
        expect(png).toContain("data:image/png;base64,iVBORw0KGgo=");
    });

    it("removes a data: URL in an href", () => {
        expect(sanitizeHtml('<a href="data:text/html,x">y</a>')).not.toContain("data:");
    });

    it("keeps a picture and its sources", () => {
        // A responsive image is a `<picture>` with a `<source>` for each
        // format. Dropping them loses the picture's own markup, and a
        // `<picture>` whose image has no `src` of its own loses the picture
        // entirely.
        const html = sanitizeHtml(
            '<picture><source srcset="https://example.com/a.webp" type="image/webp"><img src="https://example.com/a.png" alt="a"></picture>',
        );
        expect(html).toContain("<picture");
        expect(html).toContain("<source");
        expect(html).toContain("a.webp");
        expect(html).toContain("a.png");
    });

    it("removes a dangerous URL that hides in a srcset", () => {
        // The attribute as a whole starts with an harmless URL, so it has to
        // be checked candidate by candidate.
        const html = sanitizeHtml(
            '<img srcset="https://example.com/a.png 1x, javascript:alert(1) 2x">',
        );
        expect(html).not.toContain("javascript:");
    });
});

describe("sanitizeToFragment", () => {
    it("returns live nodes rather than a string", () => {
        const fragment = sanitizeToFragment("<p>Hello</p>", document);
        expect(fragment).toBeInstanceOf(DocumentFragment);
        expect(fragment.querySelector("p")?.textContent).toBe("Hello");
    });

    it("does not run scripts", () => {
        const fragment = sanitizeToFragment("<script>alert(1)</script><p>ok</p>", document);
        expect(fragment.querySelector("script")).toBeNull();
    });
});

describe("validateFetchableUrl", () => {
    it("accepts http and https", () => {
        expect(validateFetchableUrl("https://example.com/story")).not.toBeNull();
        expect(validateFetchableUrl("http://example.com/story")).not.toBeNull();
    });

    it("rejects any other scheme", () => {
        expect(validateFetchableUrl("javascript:alert(1)")).toBeNull();
        expect(validateFetchableUrl("data:text/html,<script>")).toBeNull();
        expect(validateFetchableUrl("file:///etc/passwd")).toBeNull();
    });

    it("rejects a URL that cannot be parsed", () => {
        expect(validateFetchableUrl("not a url")).toBeNull();
    });
});

describe("validateOrigin", () => {
    it("accepts a plain web host", () => {
        expect(validateOrigin("https://example.com")).toBe("https://example.com");
        expect(validateOrigin("http://example.com")).toBe("http://example.com");
    });

    it("accepts a host with a trailing slash", () => {
        expect(validateOrigin("https://example.com/")).toBe("https://example.com");
    });

    it("keeps the port, because it is part of the host", () => {
        expect(validateOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    });

    it("rejects any other scheme", () => {
        expect(validateOrigin("file:///etc/passwd")).toBeNull();
        expect(validateOrigin("javascript:alert(1)")).toBeNull();
        expect(validateOrigin("data:text/html,<script>")).toBeNull();
    });

    it("rejects an origin that carries a path", () => {
        // A path would be pasted into the permission pattern as
        // `https://example.com/some/path/*`, which is not a pattern the
        // browser understands.
        expect(validateOrigin("https://example.com/some/path")).toBeNull();
    });

    it("rejects an origin that carries a query or a fragment", () => {
        expect(validateOrigin("https://example.com/?a=b")).toBeNull();
        expect(validateOrigin("https://example.com/#section")).toBeNull();
    });

    it("rejects an origin that carries credentials", () => {
        expect(validateOrigin("https://user:pass@example.com")).toBeNull();
    });

    it("rejects a wildcard, which would grant more than one host", () => {
        expect(validateOrigin("https://*")).toBeNull();
        expect(validateOrigin("*://*/*")).toBeNull();
    });

    it("rejects an origin that cannot be parsed", () => {
        expect(validateOrigin("not a url")).toBeNull();
        expect(validateOrigin("")).toBeNull();
    });
});

describe("registrableDomain", () => {
    it("takes the last two labels", () => {
        expect(registrableDomain("www.example.com")).toBe("example.com");
        expect(registrableDomain("example.com")).toBe("example.com");
    });

    it("knows the common two-part public suffixes", () => {
        expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
        expect(registrableDomain("example.com.au")).toBe("example.com.au");
    });

    it("ignores a trailing dot and the case", () => {
        expect(registrableDomain("WWW.Example.COM.")).toBe("example.com");
    });
});

describe("isSameRegistrableDomain", () => {
    it("treats subdomains as the same site", () => {
        expect(isSameRegistrableDomain("https://www.example.com/a", "https://example.com/b")).toBe(
            true,
        );
    });

    it("treats different sites as different", () => {
        expect(isSameRegistrableDomain("https://example.org/a", "https://example.com/b")).toBe(
            false,
        );
    });

    it("treats a different scheme as different", () => {
        expect(isSameRegistrableDomain("http://example.com/a", "https://example.com/b")).toBe(
            false,
        );
    });

    it("refuses to guess when a URL is malformed", () => {
        expect(isSameRegistrableDomain("nonsense", "https://example.com")).toBe(false);
    });
});

describe("isPrivateHost", () => {
    it("names the loopback address", () => {
        expect(isPrivateHost("127.0.0.1")).toBe(true);
        expect(isPrivateHost("127.1.2.3")).toBe(true);
    });

    it("names the local host name", () => {
        expect(isPrivateHost("localhost")).toBe(true);
        expect(isPrivateHost("LOCALHOST")).toBe(true);
        expect(isPrivateHost("anything.localhost")).toBe(true);
    });

    it("names the private IPv4 ranges", () => {
        expect(isPrivateHost("10.0.0.1")).toBe(true);
        expect(isPrivateHost("172.16.0.1")).toBe(true);
        expect(isPrivateHost("172.31.255.255")).toBe(true);
        expect(isPrivateHost("192.168.1.1")).toBe(true);
    });

    it("names the link-local range, where the cloud metadata lives", () => {
        expect(isPrivateHost("169.254.169.254")).toBe(true);
    });

    it("names the IPv6 loopback and link-local addresses", () => {
        expect(isPrivateHost("[::1]")).toBe(true);
        expect(isPrivateHost("[fe80::1]")).toBe(true);
        expect(isPrivateHost("[fc00::1]")).toBe(true);
        expect(isPrivateHost("[::ffff:127.0.0.1]")).toBe(true);
    });

    it("names the local network suffix", () => {
        expect(isPrivateHost("printer.local")).toBe(true);
    });

    it("does not name a public address", () => {
        expect(isPrivateHost("example.com")).toBe(false);
        expect(isPrivateHost("8.8.8.8")).toBe(false);
        expect(isPrivateHost("172.15.0.1")).toBe(false);
        expect(isPrivateHost("172.32.0.1")).toBe(false);
        expect(isPrivateHost("192.169.1.1")).toBe(false);
        expect(isPrivateHost("[2606:4700:4700::1111]")).toBe(false);
    });
});

describe("validateFetchableUrl", () => {
    it("accepts a public web address", () => {
        expect(validateFetchableUrl("https://example.com/chapter/1")).not.toBeNull();
    });

    it("refuses a URL that is not absolute", () => {
        expect(validateFetchableUrl("/chapter/1")).toBeNull();
        expect(validateFetchableUrl("nonsense")).toBeNull();
    });

    it("refuses a scheme that is not HTTP", () => {
        expect(validateFetchableUrl("file:///etc/passwd")).toBeNull();
        expect(validateFetchableUrl("data:text/html,<script>")).toBeNull();
        expect(validateFetchableUrl("blob:https://example.com/abc")).toBeNull();
        expect(validateFetchableUrl("javascript:alert(1)")).toBeNull();
    });

    it("refuses a URL naming the local machine", () => {
        expect(validateFetchableUrl("http://localhost:8080/")).toBeNull();
        expect(validateFetchableUrl("http://127.0.0.1/")).toBeNull();
        expect(validateFetchableUrl("http://[::1]/")).toBeNull();
    });

    it("refuses a URL naming the cloud metadata service", () => {
        expect(validateFetchableUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    });

    it("refuses a URL naming the local network", () => {
        expect(validateFetchableUrl("http://192.168.0.1/")).toBeNull();
        expect(validateFetchableUrl("http://10.0.0.5/")).toBeNull();
        expect(validateFetchableUrl("http://172.16.0.1/")).toBeNull();
    });

    it("refuses a URL whose host is an obfuscated loopback address", () => {
        // The URL parser normalises these to `127.0.0.1` before the host is
        // examined, so they are caught even though they do not look like an
        // address at all.
        expect(validateFetchableUrl("http://0x7f000001/")).toBeNull();
        expect(validateFetchableUrl("http://2130706433/")).toBeNull();
        expect(validateFetchableUrl("http://127.0.0.1.nip.io/")).not.toBeNull();
    });
});
