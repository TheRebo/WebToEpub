/**
 * Tests for the host access.
 *
 * The extension ships with no host permissions: it asks for one site at a
 * time. That makes this module the boundary between "what the user has
 * allowed" and "what the extension can reach", so the rules it enforces —
 * a plain host, a pattern the extension asked for, nothing else — matter more
 * than usual.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
    displayHost,
    displayOrigin,
    hasHostAccess,
    hostPattern,
    isHostPattern,
    listHostAccess,
    originOf,
    requestHostAccess,
    revokeHostAccess,
    revokeHostPattern,
} from "../../src/core/host-access";
import { setNamespace } from "../../src/core/browser-api";

/** A namespace with a permissions API that records what it was asked. */
function permissionsNamespace(granted: string[] = []) {
    const asked: Array<{ origins?: string[]; permissions?: string[] }> = [];
    const api = {
        runtime: { getURL: (path: string) => path },
        permissions: {
            contains: async (request: { origins?: string[] }) =>
                (request.origins ?? []).every((origin) => granted.includes(origin)),
            request: async (request: { origins?: string[] }) => {
                asked.push(request);
                for (const origin of request.origins ?? []) granted.push(origin);
                return true;
            },
            remove: async (request: { origins?: string[] }) => {
                asked.push(request);
                for (const origin of request.origins ?? []) {
                    const index = granted.indexOf(origin);
                    if (index >= 0) granted.splice(index, 1);
                }
                return true;
            },
            getAll: async () => ({ origins: [...granted] }),
        },
    };
    return { api, asked, granted };
}

afterEach(() => {
    setNamespace(undefined);
});

describe("hostPattern", () => {
    it("turns an origin into a pattern for that host alone", () => {
        expect(hostPattern("https://example.com")).toBe("https://example.com/*");
    });

    it("leaves the port out, because a permission pattern has none", () => {
        // A browser's host permission is a scheme, a host and a path. A pattern
        // that named a port would match nothing at all, so the port is dropped
        // and the grant covers the host on every port.
        expect(hostPattern("http://example.com:8080")).toBe("http://example.com/*");
    });

    it("refuses an origin that carries a path", () => {
        expect(hostPattern("https://example.com/story")).toBeUndefined();
    });

    it("refuses a wildcard host", () => {
        expect(hostPattern("https://*.example.com")).toBeUndefined();
    });

    it("refuses a scheme that is not http or https", () => {
        expect(hostPattern("file:///etc/passwd")).toBeUndefined();
    });

    it("refuses something that is not an address at all", () => {
        expect(hostPattern("not a url")).toBeUndefined();
    });
});

describe("originOf", () => {
    it("gives the origin of a web address", () => {
        expect(originOf("https://example.com/story/1?page=2")).toBe("https://example.com");
    });

    it("refuses a scheme that is not http or https", () => {
        expect(originOf("ftp://example.com/file")).toBeUndefined();
    });

    it("refuses something that is not an address", () => {
        expect(originOf("example.com")).toBeUndefined();
    });
});

describe("hasHostAccess", () => {
    it("is true when the origin has been granted", async () => {
        const { api } = permissionsNamespace(["https://example.com/*"]);
        setNamespace(api as never);
        expect(await hasHostAccess("https://example.com")).toBe(true);
    });

    it("is false when it has not", async () => {
        const { api } = permissionsNamespace();
        setNamespace(api as never);
        expect(await hasHostAccess("https://example.com")).toBe(false);
    });

    it("is false when there is no browser at all", async () => {
        setNamespace(undefined);
        expect(await hasHostAccess("https://example.com")).toBe(false);
    });
});

describe("requestHostAccess", () => {
    it("asks for one host, not for the whole web", async () => {
        const { api, asked } = permissionsNamespace();
        setNamespace(api as never);

        expect(await requestHostAccess("https://example.com")).toBe(true);
        expect(asked).toEqual([{ origins: ["https://example.com/*"] }]);
    });

    it("asks for nothing when the origin is not a plain host", async () => {
        const { api, asked } = permissionsNamespace();
        setNamespace(api as never);

        expect(await requestHostAccess("https://example.com/story")).toBe(false);
        expect(asked).toEqual([]);
    });

    it("is false when there is no browser at all", async () => {
        setNamespace(undefined);
        expect(await requestHostAccess("https://example.com")).toBe(false);
    });
});

describe("listHostAccess", () => {
    it("lists the granted hosts", async () => {
        const { api } = permissionsNamespace(["https://example.com/*", "https://novels.test/*"]);
        setNamespace(api as never);
        expect(await listHostAccess()).toEqual(["https://example.com/*", "https://novels.test/*"]);
    });

    it("leaves out the extension's own optional permission", async () => {
        // The manifest declares every http and https host as *optional*. That
        // is not a grant, and a list that included it would tell the user the
        // extension could read the whole web.
        const { api } = permissionsNamespace([
            "http://*/*",
            "https://*/*",
            "https://example.com/*",
        ]);
        setNamespace(api as never);
        expect(await listHostAccess()).toEqual(["https://example.com/*"]);
    });

    it("is empty when there is no browser at all", async () => {
        setNamespace(undefined);
        expect(await listHostAccess()).toEqual([]);
    });
});

describe("revoking", () => {
    it("takes a granted pattern back", async () => {
        const { api, granted } = permissionsNamespace(["https://example.com/*"]);
        setNamespace(api as never);

        expect(await revokeHostPattern("https://example.com/*")).toBe(true);
        expect(granted).toEqual([]);
    });

    it("refuses a pattern the extension never asked for", async () => {
        const { api, granted, asked } = permissionsNamespace(["https://example.com/*"]);
        setNamespace(api as never);

        // A wildcard would be a permission the extension does not have, and
        // the options page must not be able to talk the browser into dropping
        // one that is not there.
        expect(await revokeHostPattern("https://*/*")).toBe(false);
        expect(asked).toEqual([]);
        expect(granted).toEqual(["https://example.com/*"]);
    });

    it("takes an origin back by turning it into its pattern", async () => {
        const { api, granted, asked } = permissionsNamespace(["https://example.com/*"]);
        setNamespace(api as never);

        expect(await revokeHostAccess("https://example.com")).toBe(true);
        expect(asked).toEqual([{ origins: ["https://example.com/*"] }]);
        expect(granted).toEqual([]);
    });
});

describe("isHostPattern", () => {
    it("accepts a host pattern", () => {
        expect(isHostPattern("https://example.com/*")).toBe(true);
    });

    it("rejects a wildcard host", () => {
        expect(isHostPattern("https://*/*")).toBe(false);
    });

    it("rejects a bare origin", () => {
        expect(isHostPattern("https://example.com")).toBe(false);
    });

    it("rejects a scheme that is not http or https", () => {
        expect(isHostPattern("file:///*")).toBe(false);
    });
});

describe("displayHost", () => {
    it("shows the name the user recognises", () => {
        expect(displayHost("https://www.example.com/*")).toBe("example.com");
    });

    it("leaves the port out, because a granted pattern has none", () => {
        expect(displayHost("http://example.com:8080/*")).toBe("example.com");
    });

    it("falls back to the pattern when it has no host name", () => {
        expect(displayHost("not a pattern")).toBe("not a pattern");
    });
});

describe("displayOrigin", () => {
    it("shows the host the user is on", () => {
        expect(displayOrigin("https://www.example.com")).toBe("example.com");
    });

    it("keeps the port, because it is part of the site", () => {
        expect(displayOrigin("http://example.com:8080")).toBe("example.com:8080");
    });

    it("falls back to the origin when it is not an address", () => {
        expect(displayOrigin("not an origin")).toBe("not an origin");
    });
});
