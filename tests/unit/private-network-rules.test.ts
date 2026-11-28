import { afterEach, describe, expect, it } from "vitest";
import {
    PRIVATE_HOST_URL_PATTERN,
    PRIVATE_NETWORK_BLOCK_RULE_ID,
    createPrivateNetworkRules,
    patternToRegex,
} from "../../src/core/net/dnr-rules";
import { isPrivateHost } from "../../src/core/util/sanitize";

const pattern = new RegExp(PRIVATE_HOST_URL_PATTERN);

/** Restore the namespace a test replaced. */
let restore: (() => void) | undefined;
afterEach(() => restore?.());

function withOrigin(origin: string): void {
    const global = globalThis as unknown as { browser?: unknown };
    const previous = global.browser;
    global.browser = { runtime: { getURL: () => origin } };
    restore = () => {
        global.browser = previous;
    };
}

describe("the private-network block pattern", () => {
    const urls = [
        "http://localhost/",
        "http://localhost:8080/x",
        "http://nas.local/story",
        "http://app.localhost/",
        "http://127.0.0.1/",
        "http://10.1.2.3/",
        "http://100.64.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://172.16.0.1/",
        "http://172.31.255.255/",
        "http://192.168.1.1/admin",
        "http://0.0.0.0/",
        "http://[::1]/",
        "http://[fd00::1]/",
        "http://[fe80::1]/",
        "https://example.com/",
        "https://172.32.0.1/",
        "https://100.128.0.1/",
        "https://192.169.0.1/",
        "https://local.example.com/",
        "https://localhost.example.com/",
        "https://[2001:db8::1]/",
        "https://example.com/?next=http://127.0.0.1/",
    ];

    for (const url of urls) {
        it(`agrees with isPrivateHost about ${url}`, () => {
            expect(pattern.test(url)).toBe(isPrivateHost(new URL(url).hostname));
        });
    }
});

describe("the private-network rules", () => {
    it("block every private host and let through the ones the user named", () => {
        withOrigin("moz-extension://8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13/");
        const rules = createPrivateNetworkRules(["http://nas.local/*"]);
        expect(rules[0]?.id).toBe(PRIVATE_NETWORK_BLOCK_RULE_ID);
        expect(rules[0]?.action.type).toBe("block");
        expect(rules[1]?.action.type).toBe("allow");
        expect(rules[1]?.priority).toBeGreaterThan(rules[0]?.priority ?? 0);
        expect(rules.every((rule) => rule.condition.initiatorDomains?.length === 1)).toBe(true);
    });

    it("are not installed unscoped", () => {
        withOrigin("");
        expect(createPrivateNetworkRules([])).toEqual([]);
    });

    it("turn a granted pattern into one that matches any port", () => {
        const regex = new RegExp(patternToRegex("http://nas.local/*") ?? "^$");
        expect(regex.test("http://nas.local:8080/story")).toBe(true);
        expect(regex.test("http://nas.local/story")).toBe(true);
        expect(regex.test("http://nas.local.evil.com/")).toBe(false);
        expect(patternToRegex("<all_urls>")).toBeUndefined();
    });
});
