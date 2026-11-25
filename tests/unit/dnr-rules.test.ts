import { describe, expect, it, vi } from "vitest";
import {
    ORIGIN_STRIP_RULE_ID,
    createOriginStripRule,
    createSpoofRule,
    installOriginStripRule,
    type DnrApi,
    type DnrRule,
} from "../../src/core/net/dnr-rules";

describe("the origin-stripping rule", () => {
    it("only affects the extension's own requests", () => {
        const rule = createOriginStripRule("kintsugi@example");
        expect(rule.condition.initiatorDomains).toEqual(["kintsugi@example"]);
    });

    it("removes the Origin header", () => {
        const rule = createOriginStripRule("kintsugi@example");
        expect(rule.action.requestHeaders).toEqual([{ header: "Origin", operation: "remove" }]);
    });

    it("has a stable ID, so it can be replaced rather than duplicated", () => {
        expect(createOriginStripRule("a").id).toBe(ORIGIN_STRIP_RULE_ID);
        expect(createOriginStripRule("b").id).toBe(ORIGIN_STRIP_RULE_ID);
    });
});

describe("installOriginStripRule", () => {
    it("installs the rule and clears any earlier one", async () => {
        const updateDynamicRules = vi.fn(async () => {});
        const api: DnrApi = {
            updateDynamicRules,
            getDynamicRules: async () => [{ id: 1 }, { id: 2 }],
        };

        expect(await installOriginStripRule(api, "kintsugi@example")).toBe(true);

        expect(updateDynamicRules).toHaveBeenCalledWith({
            removeRuleIds: [1, 2],
            addRules: [expect.objectContaining({ id: ORIGIN_STRIP_RULE_ID })],
        });
    });

    it("does nothing without a browser API", async () => {
        expect(await installOriginStripRule(undefined, "kintsugi@example")).toBe(false);
    });

    it("does nothing without an extension ID", async () => {
        const api: DnrApi = {
            updateDynamicRules: vi.fn(async () => {}),
            getDynamicRules: async () => [],
        };
        expect(await installOriginStripRule(api, "")).toBe(false);
        expect(api.updateDynamicRules).not.toHaveBeenCalled();
    });

    it("survives a browser that refuses the rule", async () => {
        const api: DnrApi = {
            updateDynamicRules: async () => {
                throw new Error("Not supported");
            },
            getDynamicRules: async () => [],
        };
        expect(await installOriginStripRule(api, "kintsugi@example")).toBe(false);
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
});
