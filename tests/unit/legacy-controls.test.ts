import { describe, expect, it } from "vitest";
import { syncLegacyControls } from "../../src/core/parsers/compat/legacy-controls";

describe("the legacy popup controls", () => {
    it("exist in the background document, so a parser that reads them does not throw", () => {
        const doc = document.implementation.createHTMLDocument();
        syncLegacyControls(doc, {});
        const checkbox = doc.getElementById("removeChapterNumberCheckbox") as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
        expect((doc.getElementById("lesstagsCheckbox") as HTMLInputElement).checked).toBe(true);
        doc.getElementById("removeAuthorNotesRow")!.hidden = false;
    });

    it("hold the user's settings and the story's address", () => {
        const doc = document.implementation.createHTMLDocument();
        syncLegacyControls(doc, { removeChapterNumbers: true, storyUrl: "https://example.com/s" });
        syncLegacyControls(doc, {});
        expect(
            (doc.getElementById("removeChapterNumberCheckbox") as HTMLInputElement).checked,
        ).toBe(true);
        expect((doc.getElementById("startingUrlInput") as HTMLInputElement).value).toBe(
            "https://example.com/s",
        );
        expect(doc.querySelectorAll("#removeChapterNumberCheckbox").length).toBe(1);
    });
});
