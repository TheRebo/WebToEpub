import { describe, expect, it } from "vitest";
import {
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
