import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ORIGIN_STRIP_RULE_ID,
    createOriginStripRule,
    createSpoofRule,
    initiatorDomain,
    installOriginStripRule,
    type DnrApi,
    type DnrRule,
} from "../../src/core/net/dnr-rules";

/**
 * Firefox validates every `initiatorDomains` entry as a canonical domain: the
 * value has to be exactly what `new URL("http://" + value).hostname` produces.
 *
 * This is the rule that rejected the extension's add-on ID, so the check is
 * reproduced here rather than trusted to a mock.
 */
function isCanonicalDomain(value: string): boolean {
    try {
        return new URL(`http://${value}`).hostname === value;
    } catch {
        return false;
    }
}

/** A namespace that reports the given extension origin. */
function withOrigin(origin: string): () => void {
    const global = globalThis as unknown as {
        browser?: { runtime?: { getURL?(path: string): string } };
    };
    const previous = global.browser;
    global.browser = { runtime: { getURL: () => origin } };
    return () => {
        global.browser = previous;
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("the initiator domain", () => {
    it("is the host of the extension's own origin", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            expect(initiatorDomain()).toBe("8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13");
        } finally {
            restore();
        }
    });

    it("is empty when the origin cannot be determined", () => {
        const restore = withOrigin("not a url");
        try {
            expect(initiatorDomain()).toBe("");
        } finally {
            restore();
        }
    });
});

describe("the origin-stripping rule", () => {
    it("only affects the extension's own requests", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            const rule = createOriginStripRule();
            expect(rule.condition.initiatorDomains).toEqual([
                "8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13",
            ]);
        } finally {
            restore();
        }
    });

    /**
     * The defect this rule guards against: the add-on ID is not a canonical
     * domain, and Firefox rejects the whole rule when it is used.
     */
    it("names a domain Firefox will accept", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            const domains = createOriginStripRule().condition.initiatorDomains ?? [];
            expect(domains.length).toBeGreaterThan(0);
            for (const domain of domains) {
                expect(isCanonicalDomain(domain)).toBe(true);
            }
            // The add-on ID, which is what the rule used to name, is rejected.
            expect(isCanonicalDomain("kintsugi@localhost")).toBe(false);
        } finally {
            restore();
        }
    });

    it("never names the add-on ID", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            expect(createOriginStripRule().condition.initiatorDomains).not.toContain(
                "kintsugi@localhost",
            );
        } finally {
            restore();
        }
    });

    it("removes the Origin header", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            const rule = createOriginStripRule();
            expect(rule.action.requestHeaders).toEqual([{ header: "Origin", operation: "remove" }]);
        } finally {
            restore();
        }
    });

    it("has a stable ID, so it can be replaced rather than duplicated", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            expect(createOriginStripRule().id).toBe(ORIGIN_STRIP_RULE_ID);
        } finally {
            restore();
        }
    });

    it("omits the initiator rather than naming nothing", () => {
        // An empty array is rejected by Firefox's schema, and a rule with no
        // initiator condition would match every request in the browser.
        const restore = withOrigin("not a url");
        try {
            const rule = createOriginStripRule();
            expect(rule.condition.initiatorDomains).toBeUndefined();
        } finally {
            restore();
        }
    });
});

describe("installOriginStripRule", () => {
    it("installs the rule and clears any earlier one", async () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            const updateDynamicRules = vi.fn(async () => {});
            const api: DnrApi = {
                updateDynamicRules,
                getDynamicRules: async () => [{ id: 1 }, { id: 2 }],
            };

            expect(await installOriginStripRule(api)).toBe(true);

            expect(updateDynamicRules).toHaveBeenCalledWith({
                removeRuleIds: [1, 2],
                addRules: [expect.objectContaining({ id: ORIGIN_STRIP_RULE_ID })],
            });
        } finally {
            restore();
        }
    });

    it("does nothing without a browser API", async () => {
        expect(await installOriginStripRule(undefined)).toBe(false);
    });

    it("does nothing when the extension's origin is unknown", async () => {
        const restore = withOrigin("not a url");
        try {
            const api: DnrApi = {
                updateDynamicRules: vi.fn(async () => {}),
                getDynamicRules: async () => [],
            };
            expect(await installOriginStripRule(api)).toBe(false);
            expect(api.updateDynamicRules).not.toHaveBeenCalled();
        } finally {
            restore();
        }
    });

    it("survives a browser that refuses the rule", async () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            const api: DnrApi = {
                updateDynamicRules: async () => {
                    throw new Error("Not supported");
                },
                getDynamicRules: async () => [],
            };
            expect(await installOriginStripRule(api)).toBe(false);
        } finally {
            restore();
        }
    });
});

describe("the spoofing rule", () => {
    it("sets the headers a protected site expects", () => {
        const rule = createSpoofRule(1000, {
            referer: "https://example.com/",
            requestDomains: ["example.com"],
        });

        const headers = rule.action.requestHeaders ?? [];
        expect(headers.find((header) => header.header === "Referer")?.value).toBe(
            "https://example.com/",
        );
        expect(headers.find((header) => header.header === "Sec-Fetch-Dest")?.value).toBe(
            "document",
        );
        expect(headers.find((header) => header.header === "Sec-Fetch-Site")?.value).toBe(
            "same-origin",
        );
        expect(rule.condition.requestDomains).toEqual(["example.com"]);
    });

    it("is scoped to the domain it was created for", () => {
        const rule: DnrRule = createSpoofRule(1001, {
            referer: "https://other.com/",
            requestDomains: ["other.com"],
        });
        expect(rule.condition.requestDomains).toEqual(["other.com"]);
    });

    it("names a domain Firefox will accept", () => {
        const restore = withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        try {
            const domains =
                createSpoofRule(1002, { referer: "https://example.com/" }).condition
                    .initiatorDomains ?? [];
            expect(domains.length).toBeGreaterThan(0);
            for (const domain of domains) {
                expect(isCanonicalDomain(domain)).toBe(true);
            }
        } finally {
            restore();
        }
    });
});
