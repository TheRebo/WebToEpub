/**
 * The components' shadow DOM behaviour.
 *
 * These tests exercise the four defects that made the components unusable
 * rather than merely ugly:
 *
 *  - H1: `<k-field>` never emitted `k-change`, so no plain text, number or
 *    select option ever persisted.
 *  - H2: `<k-field group>` rendered nothing on its first render.
 *  - H3: `<k-list>`'s `#focusRow` focused the wrong row in a virtualised list.
 *  - H4: `<k-radio-group>` gave every option its own random `name`, so the
 *    options were not a group at all.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-field";
import "../../../src/ui/components/k-list";
import "../../../src/ui/components/k-radio-group";

/** The shadow root of an element. */
function shadow(element: Element): ShadowRoot {
    const root = element.shadowRoot;
    if (!root) throw new Error("No shadow root");
    return root;
}

describe("k-field", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    describe("H1 — the k-change event", () => {
        it("emits a bubbling, composed k-change from the host when the text changes", () => {
            const field = document.createElement("k-field");
            field.setAttribute("name", "title");
            document.body.appendChild(field);

            const events: CustomEvent<{ value: string; name: string | null }>[] = [];
            document.body.addEventListener("k-change", (event) => {
                events.push(event as CustomEvent<{ value: string; name: string | null }>);
            });

            const input = shadow(field).querySelector("input");
            expect(input).not.toBeNull();
            (input as HTMLInputElement).value = "A Wizard of Earthsea";
            (input as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));

            expect(events).toHaveLength(1);
            const event = events[0] as CustomEvent<{ value: string; name: string | null }>;
            expect(event.bubbles).toBe(true);
            expect(event.composed).toBe(true);
            expect(event.target).toBe(field);
            expect(event.detail.value).toBe("A Wizard of Earthsea");
            expect(event.detail.name).toBe("title");
        });

        it("emits exactly one event per change", () => {
            const field = document.createElement("k-field");
            document.body.appendChild(field);

            let count = 0;
            field.addEventListener("k-change", () => {
                count += 1;
            });

            const input = shadow(field).querySelector("input") as HTMLInputElement;
            input.value = "one";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.value = "two";
            input.dispatchEvent(new Event("input", { bubbles: true }));

            expect(count).toBe(2);
        });

        it("emits k-change for a select, on its change event", () => {
            const field = document.createElement("k-field");
            field.setAttribute("type", "select");
            document.body.appendChild(field);

            const select = shadow(field).querySelector("select") as HTMLSelectElement;
            const option = document.createElement("option");
            option.value = "gold";
            option.textContent = "Gold";
            select.appendChild(option);

            let detail: { value: string; name: string | null } | undefined;
            field.addEventListener("k-change", (event) => {
                detail = (event as CustomEvent<{ value: string; name: string | null }>).detail;
            });

            select.value = "gold";
            select.dispatchEvent(new Event("change", { bubbles: true }));

            expect(detail?.value).toBe("gold");
        });

        it("reflects the typed value onto the value attribute", () => {
            const field = document.createElement("k-field");
            document.body.appendChild(field);

            const input = shadow(field).querySelector("input") as HTMLInputElement;
            input.value = "typed";
            input.dispatchEvent(new Event("input", { bubbles: true }));

            expect(field.getAttribute("value")).toBe("typed");
        });

        it("forwards min and max to the internal control", () => {
            const field = document.createElement("k-field");
            field.setAttribute("type", "number");
            field.setAttribute("min", "1");
            field.setAttribute("max", "10");
            document.body.appendChild(field);

            const input = shadow(field).querySelector("input") as HTMLInputElement;
            expect(input.getAttribute("min")).toBe("1");
            expect(input.getAttribute("max")).toBe("10");
        });

        it("keeps aria-describedby pointing at a node that exists", () => {
            const field = document.createElement("k-field");
            field.setAttribute("hint", "A hint");
            document.body.appendChild(field);

            const input = shadow(field).querySelector("input") as HTMLInputElement;
            const describedBy = input.getAttribute("aria-describedby");
            expect(describedBy).toBeTruthy();

            for (const id of (describedBy as string).split(" ")) {
                expect(shadow(field).getElementById(id)).not.toBeNull();
            }

            field.removeAttribute("hint");
            expect(input.getAttribute("aria-describedby")).toBeNull();
        });
    });

    describe("H2 — the group variant", () => {
        it("renders its markup on the first render", () => {
            const field = document.createElement("k-field");
            field.setAttribute("group", "");
            field.setAttribute("label", "Theme");
            document.body.appendChild(field);

            const root = shadow(field);
            expect(root.childElementCount).toBeGreaterThan(0);
            expect(root.querySelector(".field")).not.toBeNull();
            expect(root.querySelector(".label")?.textContent).toBe("Theme");
        });

        it("renders its markup even before it is connected", () => {
            const field = document.createElement("k-field");
            field.setAttribute("group", "");
            field.setAttribute("label", "Theme");

            // The attribute change triggers a render, and the element is not
            // in the document yet.
            expect(shadow(field).querySelector(".field")).not.toBeNull();
        });
    });
});

describe("k-list", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    /**
     * Build a list with enough items that the virtualised window cannot hold
     * them all.
     *
     * @param count The number of items.
     * @returns The list.
     */
    function buildList(count: number): HTMLElement {
        const list = document.createElement("k-list");
        list.setAttribute("row-height", "32");
        document.body.appendChild(list);
        const items = Array.from({ length: count }, (_unused, index) => ({
            id: `chapter-${index}`,
            title: `Chapter ${index}`,
        }));
        (list as unknown as { setItems(items: unknown[]): void }).setItems(items);
        return list;
    }

    describe("H3 — focusing a row", () => {
        it("focuses the row whose data-index matches, not the row at that position", () => {
            const list = buildList(500);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.focus();

            // Move far beyond the rendered window.
            for (let step = 0; step < 40; step += 1) {
                viewport.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
                );
            }

            const active = shadow(list).activeElement as HTMLElement | null;
            expect(active).not.toBeNull();
            expect(active?.dataset["index"]).toBe("40");
        });

        it("renders the target row before focusing it", () => {
            const list = buildList(500);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.focus();

            for (let step = 0; step < 300; step += 1) {
                viewport.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
                );
            }

            const active = shadow(list).activeElement as HTMLElement | null;
            expect(active?.dataset["index"]).toBe("300");
            // The row is in the DOM, and it is the focused one.
            expect(shadow(list).querySelector('[data-index="300"]')).toBe(active);
        });

        it("keeps exactly one tab stop", () => {
            const list = buildList(500);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.focus();

            for (let step = 0; step < 300; step += 1) {
                viewport.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
                );
            }

            const stops = shadow(list).querySelectorAll('[tabindex]:not([tabindex="-1"])');
            expect(stops).toHaveLength(1);
            expect(stops[0]).toBe(viewport);
        });
    });

    describe("the list's accessibility", () => {
        it("gives the list the host's own label", () => {
            const list = document.createElement("k-list");
            list.setAttribute("aria-label", "Chapters");
            document.body.appendChild(list);

            const viewport = shadow(list).querySelector(".viewport");
            expect(viewport?.getAttribute("aria-label")).toBe("Chapters");
        });

        it("does not leave the scaffolding between the list and its items", () => {
            const list = buildList(10);
            const viewport = shadow(list).querySelector(".viewport");
            const spacer = shadow(list).querySelector(".spacer");
            const rows = shadow(list).querySelector(".rows");

            // A `listitem` that is not a child of the `list` is owned by
            // nothing, and a screen reader announces the list as empty.
            expect(viewport?.getAttribute("role")).toBe("list");
            expect(spacer?.getAttribute("role")).toBe("presentation");
            expect(rows?.getAttribute("role")).toBe("presentation");
        });

        it("tells the screen reader how big the whole list is", () => {
            const list = buildList(5000);
            const row = shadow(list).querySelector(".row");

            // The list is virtualised, so the rows in the DOM are only a
            // window of the whole.
            expect(row?.getAttribute("aria-setsize")).toBe("5000");
            expect(row?.getAttribute("aria-posinset")).toBe("1");
        });
    });

    describe("the list's scroll window", () => {
        it("renders rows again after the list is filtered down", () => {
            const list = buildList(5000);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            // Scroll a long way down, as the user would after reading.
            viewport.scrollTop = 4000 * 32;
            viewport.dispatchEvent(new Event("scroll"));

            // Now the list is filtered down to three chapters.
            (list as unknown as { setItems(items: unknown[]): void }).setItems([
                { id: "a", title: "A" },
                { id: "b", title: "B" },
                { id: "c", title: "C" },
            ]);

            // The list must not be blank: it was scrolled past the end of
            // the new list, and the virtualiser would have rendered nothing.
            const rows = shadow(list).querySelectorAll(".row");
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.length).toBeLessThanOrEqual(3);
        });

        it("moves the scroll position back to the top when the list changes", () => {
            const list = buildList(5000);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.scrollTop = 4000 * 32;
            viewport.dispatchEvent(new Event("scroll"));

            (list as unknown as { setItems(items: unknown[]): void }).setItems([
                { id: "a", title: "A" },
            ]);

            expect(viewport.scrollTop).toBe(0);
        });

        it("keeps the scroll position when the same list is set again", () => {
            // The list is set again on every state change — a chapter's icon
            // changes, a row is ticked — and the user must not be thrown back
            // to the top every time it happens.
            const list = buildList(5000);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.scrollTop = 4000 * 32;
            viewport.dispatchEvent(new Event("scroll"));

            const items = Array.from({ length: 5000 }, (_unused, index) => ({
                id: `chapter-${index}`,
                title: `Chapter ${index}`,
                state: "downloaded" as const,
            }));
            (list as unknown as { setItems(items: unknown[]): void }).setItems(items);

            expect(viewport.scrollTop).toBe(4000 * 32);
        });

        it("keeps the scroll position when the list grows", () => {
            // More chapters are loaded at the end of the list; the rows the
            // user is reading have not moved.
            const list = buildList(100);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.scrollTop = 50 * 32;
            viewport.dispatchEvent(new Event("scroll"));

            const items = Array.from({ length: 200 }, (_unused, index) => ({
                id: `chapter-${index}`,
                title: `Chapter ${index}`,
            }));
            (list as unknown as { setItems(items: unknown[]): void }).setItems(items);

            expect(viewport.scrollTop).toBe(50 * 32);
        });

        it("moves the scroll position back to the top when the list is filtered", () => {
            // A filter shows a different set of rows, so the old scroll
            // position means nothing.
            const list = buildList(100);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.scrollTop = 50 * 32;
            viewport.dispatchEvent(new Event("scroll"));

            (list as unknown as { setItems(items: unknown[]): void }).setItems([
                { id: "chapter-7", title: "Chapter 7" },
                { id: "chapter-9", title: "Chapter 9" },
            ]);

            expect(viewport.scrollTop).toBe(0);
        });
    });

    describe("the list's focus", () => {
        it("keeps the focus on the row when the list re-renders", () => {
            const list = buildList(500);

            const viewport = shadow(list).querySelector(".viewport") as HTMLElement;
            viewport.focus();
            viewport.dispatchEvent(
                new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
            );

            const before = shadow(list).activeElement as HTMLElement | null;
            expect(before?.dataset["index"]).toBe("1");

            // The list re-renders — a state change, say. The focused row is
            // rebuilt, so the focus has to be put back on it, or it falls to
            // the document and the list loses its tab stop.
            (list as unknown as { setState(id: string, state: string): void }).setState(
                "chapter-1",
                "loaded",
            );

            const after = shadow(list).activeElement as HTMLElement | null;
            expect(after).not.toBeNull();
            expect(after?.dataset["index"]).toBe("1");
        });
    });

    describe("M4 — the row state", () => {
        it("threads the item's state through to the row", () => {
            const list = document.createElement("k-list");
            document.body.appendChild(list);
            const items = [
                { id: "a", title: "A", state: "failed" as const },
                { id: "b", title: "B", state: "downloaded" as const },
            ];
            (list as unknown as { setItems(items: unknown[]): void }).setItems(items);

            const rows = shadow(list).querySelectorAll(".row");
            expect(rows[0]?.getAttribute("data-state")).toBe("failed");
            expect(rows[1]?.getAttribute("data-state")).toBe("downloaded");
        });
    });
});

describe("k-radio-group", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    describe("H4 — one group, one name", () => {
        it("gives every option the same name", () => {
            const group = document.createElement("k-radio-group");
            document.body.appendChild(group);

            const typed = group as unknown as {
                addOption(value: string, label: string): void;
            };
            typed.addOption("light", "Light");
            typed.addOption("dark", "Dark");
            typed.addOption("system", "System");

            const inputs = Array.from(shadow(group).querySelectorAll("input"));
            expect(inputs).toHaveLength(3);

            const names = new Set(inputs.map((input) => input.getAttribute("name")));
            expect(names.size).toBe(1);
            expect([...names][0]).toBeTruthy();
        });

        it("gives different groups different names", () => {
            const first = document.createElement("k-radio-group");
            const second = document.createElement("k-radio-group");
            document.body.appendChild(first);
            document.body.appendChild(second);

            const typed = first as unknown as { addOption(value: string, label: string): void };
            typed.addOption("a", "A");
            const other = second as unknown as { addOption(value: string, label: string): void };
            other.addOption("a", "A");

            const firstName = shadow(first).querySelector("input")?.getAttribute("name");
            const secondName = shadow(second).querySelector("input")?.getAttribute("name");
            expect(firstName).toBeTruthy();
            expect(secondName).toBeTruthy();
            expect(firstName).not.toBe(secondName);
        });

        it("keeps the legend in the accessibility tree rather than hiding it", () => {
            const group = document.createElement("k-radio-group");
            group.setAttribute("legend", "Theme");
            document.body.appendChild(group);

            const legend = shadow(group).querySelector("legend");
            expect(legend).not.toBeNull();
            expect(legend?.textContent).toBe("Theme");
            expect(legend?.getAttribute("style") ?? "").not.toContain("display: none");
        });

        it("re-renders when the legend changes", () => {
            const group = document.createElement("k-radio-group");
            group.setAttribute("legend", "Theme");
            document.body.appendChild(group);

            group.setAttribute("legend", "Appearance");
            expect(shadow(group).querySelector("legend")?.textContent).toBe("Appearance");
        });
    });
});
