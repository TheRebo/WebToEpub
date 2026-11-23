import { describe, expect, it } from "vitest";
import {
    asBoolean,
    asNumber,
    asString,
    attempt,
    clamp,
    compileUserPattern,
    Delay,
    escapeRegExp,
    formatBytes,
    formatDuration,
    isNullOrEmpty,
    normalizeUrlForCompare,
    safeForFileName,
    trimmedOrNull,
} from "../../src/core/util/primitives";

describe("asString", () => {
    it("keeps strings and rejects everything else", () => {
        expect(asString("hello")).toBe("hello");
        expect(asString("")).toBe("");
        expect(asString(42)).toBeNull();
        expect(asString(null)).toBeNull();
        expect(asString(undefined)).toBeNull();
        expect(asString({})).toBeNull();
    });
});

describe("asNumber", () => {
    it("keeps finite numbers and rejects the rest", () => {
        expect(asNumber(0)).toBe(0);
        expect(asNumber(-1.5)).toBe(-1.5);
        expect(asNumber(Number.NaN)).toBeNull();
        expect(asNumber(Number.POSITIVE_INFINITY)).toBeNull();
        expect(asNumber("42")).toBeNull();
    });
});

describe("asBoolean", () => {
    it("keeps booleans and rejects the rest", () => {
        expect(asBoolean(true)).toBe(true);
        expect(asBoolean(false)).toBe(false);
        expect(asBoolean("true")).toBeNull();
        expect(asBoolean(1)).toBeNull();
    });
});

describe("isNullOrEmpty", () => {
    it("treats null, undefined and the empty string as empty", () => {
        expect(isNullOrEmpty(null)).toBe(true);
        expect(isNullOrEmpty(undefined)).toBe(true);
        expect(isNullOrEmpty("")).toBe(true);
        expect(isNullOrEmpty(" ")).toBe(false);
        expect(isNullOrEmpty("a")).toBe(false);
    });
});

describe("trimmedOrNull", () => {
    it("trims, and returns null for whitespace-only input", () => {
        expect(trimmedOrNull("  hello  ")).toBe("hello");
        expect(trimmedOrNull("   ")).toBeNull();
        expect(trimmedOrNull("")).toBeNull();
        expect(trimmedOrNull(null)).toBeNull();
    });
});

describe("safeForFileName", () => {
    it("replaces characters that are illegal on Windows", () => {
        expect(safeForFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
    });

    it("keeps the name usable on every platform", () => {
        expect(safeForFileName("  ...The Story...  ")).toBe("The Story");
        expect(safeForFileName("")).toBe("untitled");
        expect(safeForFileName("   ")).toBe("untitled");
    });

    it("escapes the reserved device names", () => {
        expect(safeForFileName("CON")).toBe("_CON");
        expect(safeForFileName("nul")).toBe("_nul");
        expect(safeForFileName("COM1")).toBe("_COM1");
        expect(safeForFileName("LPT9.txt")).toBe("_LPT9.txt");
        // A name that merely contains a reserved word is fine.
        expect(safeForFileName("CONAN")).toBe("CONAN");
    });

    it("removes control characters", () => {
        expect(safeForFileName("a\u0000b\u001fc\u007fd")).toBe("abcd");
    });

    it("truncates without leaving a trailing dot or space", () => {
        const name = safeForFileName("abcdefghij. klmnop", 12);
        expect(name.length).toBeLessThanOrEqual(12);
        expect(name.endsWith(".")).toBe(false);
        expect(name.endsWith(" ")).toBe(false);
    });
});

describe("normalizeUrlForCompare", () => {
    it("ignores the protocol, the trailing slash and the fragment", () => {
        expect(normalizeUrlForCompare("https://example.com/story/")).toBe(
            normalizeUrlForCompare("http://example.com/story"),
        );
        expect(normalizeUrlForCompare("https://example.com/story#chapter-3")).toBe(
            normalizeUrlForCompare("https://example.com/story"),
        );
    });

    it("keeps the host case-insensitive but the path case-sensitive", () => {
        expect(normalizeUrlForCompare("https://EXAMPLE.com/Story")).toBe(
            normalizeUrlForCompare("https://example.com/Story"),
        );
        expect(normalizeUrlForCompare("https://example.com/story")).not.toBe(
            normalizeUrlForCompare("https://example.com/Story"),
        );
    });

    it("drops tracking parameters but keeps meaningful ones", () => {
        expect(normalizeUrlForCompare("https://example.com/a?utm_source=x&id=7")).toBe(
            "example.com/a?id=7",
        );
        expect(normalizeUrlForCompare("https://example.com/a?id=7")).toBe("example.com/a?id=7");
    });

    it("falls back to a string comparison for a malformed URL", () => {
        expect(normalizeUrlForCompare("  Not A URL  ")).toBe("not a url");
    });
});

describe("clamp", () => {
    it("keeps a value inside its range", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(11, 0, 10)).toBe(10);
    });
});

describe("escapeRegExp", () => {
    it("escapes every character that could carry meaning", () => {
        const escaped = escapeRegExp("a.b*c");
        expect(new RegExp(escaped).test("a.b*c")).toBe(true);
        expect(new RegExp(escaped).test("axbxc")).toBe(false);
    });
});

describe("compileUserPattern", () => {
    it("returns null for an invalid pattern instead of throwing", () => {
        expect(compileUserPattern("[unclosed")).toBeNull();
    });

    it("rejects a pattern that is too long", () => {
        expect(compileUserPattern("a".repeat(500))).toBeNull();
    });

    it("compiles a valid pattern, case-insensitively", () => {
        const pattern = compileUserPattern("chapter");
        expect(pattern?.test("CHAPTER ONE")).toBe(true);
    });
});

describe("attempt", () => {
    it("wraps a successful call", () => {
        expect(attempt(() => 42)).toEqual({ ok: true, value: 42 });
    });

    it("wraps a thrown error", () => {
        const result = attempt(() => {
            throw new Error("nope");
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.message).toBe("nope");
    });
});

describe("Delay", () => {
    it("resolves after the wait", async () => {
        const delay = new Delay();
        const started = Date.now();
        await delay.wait(20);
        expect(Date.now() - started).toBeGreaterThanOrEqual(15);
    });

    it("resolves immediately when cancelled", async () => {
        const delay = new Delay();
        const promise = delay.wait(5000);
        delay.cancel();
        await promise;
    });
});

describe("formatBytes", () => {
    it("uses binary units", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1024)).toBe("1.0 KB");
        expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    });

    it("refuses to format a nonsense value", () => {
        expect(formatBytes(-1)).toBe("—");
        expect(formatBytes(Number.NaN)).toBe("—");
    });
});

describe("formatDuration", () => {
    it("scales the unit to the length", () => {
        expect(formatDuration(5000)).toBe("5s");
        expect(formatDuration(65_000)).toBe("1m 5s");
        expect(formatDuration(3_725_000)).toBe("1h 2m");
    });
});
