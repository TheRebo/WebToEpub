import { describe, expect, it, vi } from "vitest";
import {
    CookieBridge,
    type CookieApi,
    type CookieRecord,
    type CopiedCookie,
} from "../../src/core/net/cookie-bridge";
import { FetchClient } from "../../src/core/net/fetch-client";
import { createCookieApi } from "../../src/core/net/browser-cookie-api";

/**
 * A recording cookie API.
 *
 * It remembers what was set and removed, so a test can assert that the
 * extension cleans up after itself.
 */
function recordingApi(initial: CookieRecord[] = []): {
    api: CookieApi;
    set: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
} {
    const set = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
    const api: CookieApi = {
        getAll: async () => initial,
        set,
        remove,
    };
    return { api, set, remove };
}

describe("CookieBridge", () => {
    it("copies only the partitioned cookies for the domain", async () => {
        const { api, set } = recordingApi([
            {
                name: "session",
                value: "abc",
                domain: ".example.com",
                path: "/",
                secure: true,
                httpOnly: true,
                partitionKey: "https://example.com",
            },
            {
                name: "plain",
                value: "def",
                domain: ".example.com",
                path: "/",
                secure: true,
                httpOnly: true,
            },
        ]);

        const bridge = new CookieBridge(api);
        const copied = await bridge.copyForDomain("example.com");

        // The copy is remembered with the place it was put, so that exactly
        // that copy can be removed again.
        expect(copied).toEqual([{ name: "session", path: "/", domain: "example.com" }]);
        expect(set).toHaveBeenCalledTimes(1);
        // The copy is explicitly unpartitioned, which is what lets the
        // extension's own request carry it.
        expect(set.mock.calls[0]?.[0]).toMatchObject({
            name: "session",
            value: "abc",
            partitionKey: null,
            // The copy is set on the cookie's own host, not on the host that
            // was asked for: a cookie set on `.example.com` belongs to
            // `example.com` and to everything under it.
            url: "https://example.com/",
        });
    });

    it("leaves a cookie that belongs to another domain alone", async () => {
        const { api, set } = recordingApi([
            {
                name: "other",
                value: "xyz",
                domain: ".other.com",
                path: "/",
                secure: false,
                httpOnly: false,
                partitionKey: "https://other.com",
            },
        ]);

        const bridge = new CookieBridge(api);
        expect(await bridge.copyForDomain("example.com")).toEqual([]);
        expect(set).not.toHaveBeenCalled();
    });

    it("removes the cookies it copied", async () => {
        const { api, remove } = recordingApi([
            {
                name: "session",
                value: "abc",
                domain: ".example.com",
                path: "/",
                secure: true,
                httpOnly: true,
                partitionKey: "https://example.com",
            },
        ]);

        const bridge = new CookieBridge(api);
        await bridge.copyForDomain("example.com");
        await bridge.removeForDomain("example.com", [
            { name: "session", path: "/", domain: "example.com" },
        ]);

        expect(remove).toHaveBeenCalledWith({
            url: "https://example.com/",
            name: "session",
            path: "/",
        });
        expect(bridge.copiedCookies.size).toBe(0);
    });

    it("removes a cookie copied at a path below the root", async () => {
        // The browser identifies a cookie by its domain, its path and its
        // name. A removal that names the root path does not match a cookie
        // that was set at `/app`, so the copy would stay in the jar and be
        // sent with every later request to that host.
        const { api, remove, set } = recordingApi([
            {
                name: "session",
                value: "abc",
                domain: ".example.com",
                path: "/app",
                secure: true,
                httpOnly: true,
                partitionKey: "https://example.com",
            },
        ]);

        const bridge = new CookieBridge(api);
        await bridge.copyForDomain("example.com");
        await bridge.removeForDomain("example.com", [
            { name: "session", path: "/app", domain: "example.com" },
        ]);

        expect(set).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/app", url: "https://example.com/app" }),
        );
        expect(remove).toHaveBeenCalledWith({
            url: "https://example.com/app",
            name: "session",
            path: "/app",
        });
    });

    it("survives a browser that will not disclose the cookies", async () => {
        const api: CookieApi = {
            getAll: async () => {
                throw new Error("Permission denied");
            },
            set: async () => {},
            remove: async () => {},
        };

        const bridge = new CookieBridge(api);
        expect(await bridge.copyForDomain("example.com")).toEqual([]);
    });
});

describe("FetchClient's cookie handling", () => {
    /** A client whose bridge records what it copied. */
    function clientWithBridge(): {
        client: FetchClient;
        copied: string[];
        removed: CopiedCookie[][];
    } {
        const copied: string[] = [];
        const removed: CopiedCookie[][] = [];
        const client = new FetchClient({
            fetch: vi.fn(
                async () =>
                    new Response("<html><body>ok</body></html>", {
                        status: 200,
                        headers: { "Content-Type": "text/html" },
                    }),
            ) as unknown as typeof globalThis.fetch,
            sleep: async () => {},
            cookies: {
                copyForDomain: async (domain: string) => {
                    copied.push(domain);
                    return [{ name: "session", path: "/", domain }];
                },
                removeForDomain: async (_domain: string, copies: CopiedCookie[]) => {
                    removed.push(copies);
                },
            },
        });
        return { client, copied, removed };
    }

    it("copies the site's cookies before the request", async () => {
        const { client, copied } = clientWithBridge();
        await client.fetchHtml("https://example.com/chapter/1");
        expect(copied).toEqual(["example.com"]);
    });

    it("removes the copied cookies after a successful request", async () => {
        const { client, removed } = clientWithBridge();
        await client.fetchHtml("https://example.com/chapter/1");
        expect(removed).toEqual([[{ name: "session", path: "/", domain: "example.com" }]]);
    });

    it("removes the copied cookies after a request that throws", async () => {
        const removed: CopiedCookie[][] = [];
        const client = new FetchClient({
            fetch: vi.fn(async () => {
                throw new Error("Network is down");
            }) as unknown as typeof globalThis.fetch,
            sleep: async () => {},
            cookies: {
                copyForDomain: async (domain) => [{ name: "session", path: "/", domain }],
                removeForDomain: async (_domain, copies) => {
                    removed.push(copies);
                },
            },
        });

        await expect(client.fetchHtml("https://example.com/chapter/1")).rejects.toThrow();
        expect(removed).toEqual([[{ name: "session", path: "/", domain: "example.com" }]]);
    });

    it("does not touch the cookies when the request opts out", async () => {
        const { client, copied, removed } = clientWithBridge();
        await client.fetchHtml("https://example.com/chapter/1", { useCookies: false });
        expect(copied).toEqual([]);
        expect(removed).toEqual([]);
    });

    it("cleans the cookies up for a JSON request too", async () => {
        const removed: CopiedCookie[][] = [];
        const client = new FetchClient({
            fetch: vi.fn(
                async () =>
                    new Response('{"ok":true}', {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    }),
            ) as unknown as typeof globalThis.fetch,
            sleep: async () => {},
            cookies: {
                copyForDomain: async (domain) => [{ name: "session", path: "/", domain }],
                removeForDomain: async (_domain, copies) => {
                    removed.push(copies);
                },
            },
        });

        await client.fetchJson("https://example.com/api/chapters");
        expect(removed).toEqual([[{ name: "session", path: "/", domain: "example.com" }]]);
    });
});

describe("the browser cookie adapter", () => {
    it("asks the browser for every partition when the bridge asks for a domain", async () => {
        const getAll = vi.fn(async () => [
            {
                name: "session",
                value: "abc",
                domain: ".example.com",
                path: "/app",
                secure: true,
                httpOnly: true,
                partitionKey: { topLevelSite: "https://example.com" },
            },
        ]);
        const api = createCookieApi({
            getAll,
            set: async () => {},
            remove: async () => {},
        });

        const cookies = await api?.getAll({ domain: "example.com" });

        // Without a partition key the browser reports unpartitioned cookies
        // only, and the bridge would never find one to copy.
        expect(getAll).toHaveBeenCalledWith({ domain: "example.com", partitionKey: {} });
        expect(cookies?.[0]).toMatchObject({
            name: "session",
            domain: ".example.com",
            path: "/app",
            secure: true,
            httpOnly: true,
            partitionKey: "https://example.com",
        });
    });

    it("fills in the fields the browser leaves out", async () => {
        const api = createCookieApi({
            getAll: async () => [{ name: "a", value: "b" }],
            set: async () => {},
            remove: async () => {},
        });

        const cookies = await api?.getAll({ domain: "example.com" });

        expect(cookies?.[0]).toMatchObject({
            domain: "example.com",
            path: "/",
            secure: false,
            httpOnly: false,
        });
        // A cookie with no partition key is not partitioned.
        expect(cookies?.[0]?.partitionKey).toBeUndefined();
    });

    it("passes the null partition key through when setting a cookie", async () => {
        // The null partition key is what creates the unpartitioned
        // counterpart, so it must survive even though it is falsy.
        const set = vi.fn(async () => {});
        const api = createCookieApi({
            getAll: async () => [],
            set,
            remove: async () => {},
        });

        await api?.set({
            url: "https://example.com/",
            name: "session",
            value: "abc",
            partitionKey: null,
        });

        expect(set).toHaveBeenCalledWith(
            expect.objectContaining({ partitionKey: null, name: "session" }),
        );
    });

    it("returns nothing when the browser has no cookie API", () => {
        expect(createCookieApi(undefined)).toBeUndefined();
    });
});

describe("the bridge and the user's own cookies", () => {
    it("does not overwrite an unpartitioned cookie the user already has", async () => {
        const set = vi.fn(async () => {});
        const bridge = new CookieBridge({
            getAll: async (details) =>
                details.domain
                    ? [
                          {
                              name: "sid",
                              value: "copy",
                              domain: ".example.com",
                              path: "/",
                              secure: true,
                              httpOnly: true,
                              partitionKey: "https://example.com",
                          },
                      ]
                    : [
                          {
                              name: "sid",
                              value: "mine",
                              domain: ".example.com",
                              path: "/",
                              secure: true,
                              httpOnly: true,
                          },
                      ],
            set,
            remove: async () => {},
        });
        expect(await bridge.copyForDomain("example.com")).toEqual([]);
        expect(set).not.toHaveBeenCalled();
    });

    it("keeps a domain cookie a domain cookie", async () => {
        const set = vi.fn(async () => {});
        const bridge = new CookieBridge({
            getAll: async (details) =>
                details.domain
                    ? [
                          {
                              name: "cf",
                              value: "x",
                              domain: ".example.com",
                              path: "/",
                              secure: true,
                              httpOnly: true,
                              partitionKey: "https://example.com",
                          },
                      ]
                    : [],
            set,
            remove: async () => {},
        });
        await bridge.copyForDomain("www.example.com");
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ domain: ".example.com" }));
    });
});
