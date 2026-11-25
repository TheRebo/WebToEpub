/**
 * The workbench's view.
 *
 * The view is what the user sees, so two things matter here: that it does not
 * throw away what the user typed, and that every control it builds can be
 * reached and understood.
 */
import { describe, expect, it } from "vitest";
import {
    buildWorkbench,
    deriveFilename,
    renderWorkbench,
    type WorkbenchElements,
} from "../../../src/ui/pages/workbench/view";
import type { WorkbenchState } from "../../../src/ui/pages/workbench/state";

/** A state with nothing in it. */
function emptyState(): WorkbenchState {
    return {
        story: {
            title: "",
            author: "",
            language: "en",
            coverUrl: "",
            description: "",
            sourceUrl: "",
            parserName: "",
            fileName: "untitled.epub",
            fileNameEdited: false,
        },
        chapters: [],
        loadingChapters: false,
        filter: { query: "", useRegex: false, include: [], exclude: [] },
        dirty: false,
        usedDefaultParser: false,
        progress: undefined,
        error: undefined,
    };
}

/** Build the workbench into a fresh root. */
function build(): { elements: WorkbenchElements; root: HTMLElement } {
    const root = document.createElement("div");
    document.body.appendChild(root);
    return { elements: buildWorkbench(root), root };
}

describe("the workbench's file name field", () => {
    it("shows the name the state holds", () => {
        const { elements } = build();
        const state = emptyState();
        state.story.fileName = "My Own Name.epub";

        renderWorkbench(elements, state, [], 0);

        expect(elements.filenameField.value).toBe("My Own Name.epub");
    });

    it("does not overwrite the name when the title changes", () => {
        // The field used to be filled in from the title on every render, so a
        // name the user had typed was thrown away by the next progress report.
        const { elements } = build();
        const state = emptyState();
        state.story.fileName = "My Own Name.epub";

        renderWorkbench(elements, state, [], 0);
        state.story.title = "A Different Story";
        renderWorkbench(elements, state, [], 0);

        expect(elements.filenameField.value).toBe("My Own Name.epub");
    });
});

describe("deriveFilename", () => {
    it("uses the title", () => {
        expect(deriveFilename("A Story")).toBe("A Story.epub");
    });

    it("uses the template", () => {
        expect(deriveFilename("A Story", "A Writer", "{title} by {author}")).toBe(
            "A Story by A Writer.epub",
        );
    });

    it("makes the name safe", () => {
        expect(deriveFilename("A/B")).toBe("A-B.epub");
    });

    it("falls back to a name for a book with no title", () => {
        expect(deriveFilename("")).toBe("untitled.epub");
    });
});

describe("the workbench's controls", () => {
    it("gives the filter's fields a label", () => {
        // The filter's fields were built with a helper that returns both the
        // input and its label, and only the input was kept — so the label was
        // thrown away and the field had no name at all.
        const { elements } = build();

        for (const input of [
            elements.filterSearch,
            elements.filterInclude,
            elements.filterExclude,
        ]) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            expect(label).not.toBeNull();
            expect(label?.textContent?.trim()).not.toBe("");
        }
    });

    it("gives the story's fields a label", () => {
        const { elements } = build();

        for (const input of [elements.titleField, elements.authorField, elements.filenameField]) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            expect(label).not.toBeNull();
        }
    });

    it("gives the selector dialog's fields a label and a hint", () => {
        const { elements } = build();

        for (const input of [
            elements.selectorContent,
            elements.selectorTitle,
            elements.selectorRemove,
        ]) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            expect(label).not.toBeNull();
            const hint = document.getElementById(input.getAttribute("aria-describedby") ?? "");
            expect(hint?.textContent?.trim()).not.toBe("");
        }
    });

    it("gives the select-all checkbox a name", () => {
        const { elements } = build();
        expect(elements.selectAll.getAttribute("aria-label")).toBeTruthy();
    });
});
