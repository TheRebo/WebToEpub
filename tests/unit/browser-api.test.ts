/**
 * Tests for the browser API facade.
 *
 * The storage adapter is the only way the extension's pages reach
 * `browser.storage.local`. A write that quietly did nothing would tell the
 * user their choice was saved when it was not — and they would find it
 * reverted the next time the extension started.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
    getURL,
    localStorageAdapter,
    sessionStorageAdapter,
    setNamespace,
    version,
} from "../../src/core/browser-api";

afterEach(() => {
    setNamespace(undefined);
});

describe("the storage adapter", () => {
    it("refuses to write when the storage API is not there", async () => {
        setNamespace(undefined);
        await expect(localStorageAdapter.set({ a: 1 })).rejects.toThrow(/not available/);
    });

    it("refuses to remove when the storage API is not there", async () => {
        setNamespace(undefined);
        await expect(localStorageAdapter.remove("a")).rejects.toThrow(/not available/);
    });

    it("refuses to write a checkpoint when the session storage is not there", async () => {
        setNamespace(undefined);
        await expect(sessionStorageAdapter.set({ a: 1 })).rejects.toThrow(/not available/);
    });

    it("reads nothing when the storage API is not there", async () => {
        // A read has nothing to report, so an empty result is right. A write
        // has something to report, and cannot.
        setNamespace(undefined);
        expect(await localStorageAdapter.get("a")).toEqual({});
    });

    it("writes through to the browser's storage", async () => {
        const written: Record<string, unknown>[] = [];
        setNamespace({
            runtime: { getURL: (path: string) => `moz-extension://abc/${path}` },
            storage: {
                local: {
                    get: async () => ({}),
                    set: async (items: Record<string, unknown>) => {
                        written.push(items);
                    },
                    remove: async () => {},
                },
            },
        } as never);

        await localStorageAdapter.set({ theme: "dark" });
        expect(written).toEqual([{ theme: "dark" }]);
    });
});

describe("getURL", () => {
    it("resolves an extension-relative path", () => {
        setNamespace({
            runtime: { getURL: (path: string) => `moz-extension://abc/${path}` },
        } as never);
        expect(getURL("pages/workbench.html")).toBe("moz-extension://abc/pages/workbench.html");
    });

    it("falls back to the path when there is no runtime", () => {
        setNamespace(undefined);
        expect(getURL("pages/workbench.html")).toBe("pages/workbench.html");
    });
});

describe("version", () => {
    it("reports the manifest's version", () => {
        setNamespace({
            runtime: {
                getURL: (path: string) => path,
                getManifest: () => ({ version: "2.0.0-alpha.1" }),
            },
        } as never);
        expect(version()).toBe("2.0.0-alpha.1");
    });

    it("falls back when there is no manifest", () => {
        setNamespace(undefined);
        expect(version()).toBe("0.0.0");
    });
});
