/**
 * Tests for the fetch policy.
 *
 * The policy decides what the extension is allowed to reach. Getting it
 * wrong in one direction makes the extension useless — a story served from a
 * home server can never be downloaded — and getting it wrong in the other
 * makes it a proxy into the user's own network. Both directions are tested
 * here, because neither of them is obvious.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mayFetchUrl } from "../../src/core/net/fetch-policy";
import { setNamespace } from "../../src/core/browser-api";

/**
 * A namespace whose permissions API knows about a set of granted origins.
 *
 * @param granted The origins the user has allowed.
 * @returns A namespace, in the shape the browser API expects.
 */
function namespaceWith(granted: string[]) {
    return {
        runtime: { getURL: (path: string) => path },
        permissions: {
            contains: async (request: { origins?: string[] }) =>
                (request.origins ?? []).every((origin) => granted.includes(origin)),
            request: async () => true,
            remove: async () => true,
            getAll: async () => ({ origins: [...granted] }),
        },
    };
}

afterEach(() => {
    setNamespace(undefined);
});

describe("mayFetchUrl", () => {
    it("allows a public host, because that is what the extension is for", async () => {
        setNamespace(namespaceWith([]) as never);
        const url = await mayFetchUrl("https://example.com/story/1");
        expect(url?.href).toBe("https://example.com/story/1");
    });

    it("refuses a file URL, whatever the user has allowed", async () => {
        setNamespace(namespaceWith(["file:///*"]) as never);
        expect(await mayFetchUrl("file:///etc/passwd")).toBeNull();
    });

    it("refuses a data URL", async () => {
        setNamespace(namespaceWith([]) as never);
        expect(await mayFetchUrl("data:text/html,<h1>hi</h1>")).toBeNull();
    });

    it("refuses something that is not an address", async () => {
        setNamespace(namespaceWith([]) as never);
        expect(await mayFetchUrl("not a url")).toBeNull();
    });

    it("refuses a private host the user has not allowed", async () => {
        setNamespace(namespaceWith([]) as never);
        expect(await mayFetchUrl("http://192.168.1.10/story/1")).toBeNull();
    });

    it("refuses the loopback address the user has not allowed", async () => {
        setNamespace(namespaceWith([]) as never);
        expect(await mayFetchUrl("http://127.0.0.1:8080/story")).toBeNull();
    });

    it("allows a private host the user has allowed", async () => {
        setNamespace(namespaceWith(["http://192.168.1.10/*"]) as never);
        const url = await mayFetchUrl("http://192.168.1.10/story/1");
        expect(url?.href).toBe("http://192.168.1.10/story/1");
    });

    it("refuses a private host when only a different host has been allowed", async () => {
        // One allowed site must never be a key to the rest of the network.
        setNamespace(namespaceWith(["https://example.com/*"]) as never);
        expect(await mayFetchUrl("http://192.168.1.10/story/1")).toBeNull();
    });

    it("allows a private host on another port, because a grant covers the whole host", async () => {
        // A browser's host permission has no port in it: the grant is for the
        // host, and every port on that host comes with it. A story served from
        // `192.168.1.10:9000` is the same site as the one on port 80.
        setNamespace(namespaceWith(["http://192.168.1.10/*"]) as never);
        expect(await mayFetchUrl("http://192.168.1.10:9000/story")).not.toBeNull();
    });

    it("allows a local host name the user has allowed", async () => {
        setNamespace(namespaceWith(["http://nas.local/*"]) as never);
        expect(await mayFetchUrl("http://nas.local:8080/story")).not.toBeNull();
    });

    it("refuses a local host name the user has not allowed", async () => {
        setNamespace(namespaceWith([]) as never);
        expect(await mayFetchUrl("http://nas.local:8080/story")).toBeNull();
    });

    it("refuses a private host when there is no browser to ask", async () => {
        setNamespace(undefined);
        expect(await mayFetchUrl("http://192.168.1.10/story/1")).toBeNull();
    });

    it("allows a public host even when there is no browser to ask", async () => {
        // The browser is asked only about private hosts; a public one needs
        // no grant to be judged.
        setNamespace(undefined);
        expect(await mayFetchUrl("https://example.com/")).not.toBeNull();
    });
});
