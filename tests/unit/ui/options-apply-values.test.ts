/**
 * Pushing new values into the options page's controls.
 *
 * The page is built once, so a control owns its own value. When the settings
 * change *underneath* the page — because the user imported a file, or reset
 * everything — the controls have to be told, or the page would keep showing
 * the values it was built with.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-field";
import "../../../src/ui/components/k-radio-group";
import "../../../src/ui/components/k-switch";

import { applyValues, type OptionsElements } from "../../../src/ui/pages/options/view";

/**
 * Build a set of elements with only the maps `applyValues` reads.
 *
 * The function only needs the value hosts, so a minimal object is enough and
 * the test does not have to build a whole page.
 *
 * @param hosts The value hosts, by settings path.
 * @returns The elements.
 */
function elementsWith(hosts: Map<string, HTMLElement>): OptionsElements {
    return { valueHosts: hosts } as unknown as OptionsElements;
}

/** Whether a switch is on. */
function switchIsOn(toggle: Element): boolean {
    const input = toggle.shadowRoot?.querySelector("input") as HTMLInputElement;
    return input?.checked ?? false;
}

describe("the options page's applyValues", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("turns a switch on", () => {
        // The old code looked for a `value` property, which a switch does not
        // have — it has `checked`. So every switch in the page kept the value
        // it was built with, and importing a settings file changed the stored
        // settings without changing what the page showed.
        const toggle = document.createElement("k-switch");
        toggle.setAttribute("label", "Reduce motion");
        document.body.appendChild(toggle);

        applyValues(elementsWith(new Map([["appearance.reduceMotion", toggle]])), {
            "appearance.reduceMotion": true,
        });

        expect(switchIsOn(toggle)).toBe(true);
        expect(toggle.getAttribute("checked")).not.toBeNull();
    });

    it("turns a switch off", () => {
        const toggle = document.createElement("k-switch");
        toggle.setAttribute("label", "Reduce motion");
        toggle.setAttribute("checked", "");
        document.body.appendChild(toggle);

        applyValues(elementsWith(new Map([["appearance.reduceMotion", toggle]])), {
            "appearance.reduceMotion": false,
        });

        expect(switchIsOn(toggle)).toBe(false);
        expect(toggle.hasAttribute("checked")).toBe(false);
    });

    it("writes a string into a field", () => {
        const field = document.createElement("k-field");
        field.setAttribute("label", "File name template");
        field.setAttribute("value", "{title}");
        document.body.appendChild(field);

        applyValues(elementsWith(new Map([["story.filenameTemplate", field]])), {
            "story.filenameTemplate": "{title} - {chapter}",
        });

        const input = field.shadowRoot?.querySelector("input") as HTMLInputElement;
        expect(input?.value).toBe("{title} - {chapter}");
    });

    it("writes a string into a segmented choice", () => {
        const group = document.createElement("k-radio-group");
        group.setAttribute("value", "light");
        group.addOption("light", "Light");
        group.addOption("dark", "Dark");
        document.body.appendChild(group);

        applyValues(elementsWith(new Map([["appearance.theme", group]])), {
            "appearance.theme": "dark",
        });

        const options = group.shadowRoot?.querySelectorAll<HTMLInputElement>("input[type=radio]");
        expect(options?.[1]?.checked).toBe(true);
    });

    it("leaves a control alone when the setting has no value", () => {
        const toggle = document.createElement("k-switch");
        document.body.appendChild(toggle);

        applyValues(elementsWith(new Map([["appearance.reduceMotion", toggle]])), {});

        expect(switchIsOn(toggle)).toBe(false);
    });
});
