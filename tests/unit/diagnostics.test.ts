/**
 * The developer diagnostics.
 *
 * The settings page offers a "Developer diagnostics" switch, and the
 * development guide tells the reader to turn it on to get verbose logging —
 * but nothing read the setting, so the switch did nothing and the guide was
 * wrong.
 *
 * These tests cover the three things that matter: the logger is off by
 * default, it stays quiet when it is off, and it never writes a URL's query
 * string, which is where a session token lives.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    diagnostic,
    diagnosticUrl,
    diagnosticsEnabled,
    setDiagnosticsEnabled,
} from "../../src/core/util/diagnostics";

describe("the diagnostics", () => {
    afterEach(() => {
        setDiagnosticsEnabled(false);
        vi.restoreAllMocks();
    });

    it("are off by default", () => {
        expect(diagnosticsEnabled()).toBe(false);
    });

    it("say nothing when they are off", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

        setDiagnosticsEnabled(false);
        diagnostic("A message");

        expect(info).not.toHaveBeenCalled();
    });

    it("say something when they are on", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

        setDiagnosticsEnabled(true);
        diagnostic("A message");

        expect(info).toHaveBeenCalledOnce();
        expect(String(info.mock.calls[0]?.[0])).toContain("A message");
    });

    it("do not log a URL they cannot parse", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

        setDiagnosticsEnabled(true);
        diagnosticUrl("Fetching", "not a url");

        // A URL that cannot be read is replaced rather than logged raw: it
        // might hold anything, and a log line is the last place that should
        // happen.
        expect(info.mock.calls[0]?.[1]).toBe("<unparsable url>");
    });

    it("log a redacted URL", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

        setDiagnosticsEnabled(true);
        diagnosticUrl("Fetching", "https://example.com/chapter?token=secret");

        const logged = String(info.mock.calls[0]?.[0]);
        expect(logged).not.toContain("secret");
        expect(info.mock.calls[0]?.[1]).toBe("https://example.com/chapter");
    });
});
