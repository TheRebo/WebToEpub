/**
 * The end-to-end checks.
 *
 * These run against the **real extension** — the built `dist/`, installed into
 * a real Firefox as a temporary add-on — and drive the real pages. Nothing is
 * stubbed: the popup talks to the real background worker, the worker really
 * fetches the pages, and the chapter list really comes out of the parser.
 *
 * The one thing that is faked is the *website*. A tiny local server
 * (`tools/e2e-fixture.mjs`) stands in for a novel site, so the checks never
 * touch the public internet and always see the same content.
 *
 * The module exports a single `run` function that returns the number of
 * failures, so the harness can turn it into an exit code.
 */

/** A check that failed. */
const failures = [];

/**
 * Run one check.
 *
 * @param {string} name The check's name.
 * @param {() => Promise<void> | void} body The check.
 */
async function check(name, body) {
    try {
        await body();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name, message });
        console.log(`  ✗ ${name}`);
        console.log(`      ${message}`);
    }
}

/**
 * Assert that a value is truthy.
 *
 * @param {unknown} value The value.
 * @param {string} message The message shown when it is not.
 */
function assert(value, message) {
    if (!value) throw new Error(message);
}

/**
 * Assert that two values are equal.
 *
 * @param {unknown} actual The actual value.
 * @param {unknown} expected The expected value.
 * @param {string} message The message shown when they differ.
 */
function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(
            `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
        );
    }
}

/**
 * Sleep.
 *
 * @param {number} ms How long to sleep.
 * @returns {Promise<void>} A promise that resolves after the delay.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until a page expression becomes true.
 *
 * @param {import("../../tools/e2e-harness.mjs").Harness} harness The harness.
 * @param {string} body The expression, evaluated in the page.
 * @param {number} timeoutMs How long to wait.
 */
async function waitFor(harness, body, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await harness.script(`return Boolean(${body});`);
        if (value) return;
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for: ${body}`);
        await sleep(100);
    }
}

/**
 * Write a setting into the extension's storage.
 *
 * @param {import("../../tools/e2e-harness.mjs").Harness} harness The harness.
 * @param {Record<string, unknown>} appearance The appearance settings.
 */
async function writeAppearance(harness, appearance) {
    await harness.asyncScript(`
        const api = globalThis.browser ?? globalThis.chrome;
        const stored = await api.storage.local.get("kintsugi.settings");
        const settings = stored["kintsugi.settings"] ?? {};
        settings.appearance = { ...(settings.appearance ?? {}), ...${JSON.stringify(appearance)} };
        await api.storage.local.set({ "kintsugi.settings": settings });
        return true;
    `);
}

/**
 * Run the checks.
 *
 * @param {import("../../tools/e2e-harness.mjs").Harness} harness The harness.
 * @returns {Promise<number>} The number of failures.
 */
export async function run(harness) {
    console.log("Kintsugi — end-to-end checks\n");

    // -----------------------------------------------------------------
    // The popup
    // -----------------------------------------------------------------
    console.log("The popup");

    await harness.setViewport(400, 580);
    await harness.goto("popup.html");
    await sleep(1500);

    await check("renders its shell", async () => {
        const result = await harness.script(`
            return JSON.stringify({
                wordmark: document.querySelector(".popup-wordmark")?.textContent,
                hasSettings: Boolean(document.querySelector(".popup-settings")),
                state: document.body.dataset.state,
            });
        `);
        const data = JSON.parse(result);
        assertEqual(data.wordmark, "Kintsugi", "The wordmark is missing.");
        assert(data.hasSettings, "The settings button is missing.");
        assert(
            ["loading", "story", "no-story", "unsupported", "running", "error"].includes(
                data.state,
            ),
            `The popup reports an unknown state ("${data.state}").`,
        );
    });

    await check("shows an empty state when the page is not a story", async () => {
        const result = await harness.script(`
            const empty = document.querySelector(".popup-empty");
            return JSON.stringify({
                state: document.body.dataset.state,
                emptyHidden: empty?.hidden,
                text: document.querySelector(".popup-empty-text")?.textContent ?? "",
            });
        `);
        const data = JSON.parse(result);
        assert(
            data.state === "unsupported" || data.state === "no-story",
            `The popup should report the page as unsupported (got "${data.state}").`,
        );
        assertEqual(data.emptyHidden, false, "The empty state should be visible.");
        assert(data.text.length > 0, "The empty state has no explanation.");
    });

    await check("shows the story when the active tab is a novel", async () => {
        // The popup reads the *active* tab, so a fixture page has to be the
        // active one. Marionette activates the tab it switches to, so the
        // popup cannot simply look at a background tab.
        const handles = await harness.windowHandles();
        const storyHandle = await harness.newTab();
        await harness.switchTo(storyHandle);
        await harness.navigate(`${harness.fixtureOrigin}/`);
        await harness.switchTo(handles[0]);

        await harness.goto("popup.html");
        await harness.asyncScript(`
            const api = globalThis.browser ?? globalThis.chrome;
            const tabs = await api.tabs.query({});
            const story = tabs.find((tab) => tab.url && tab.url.startsWith(${JSON.stringify(harness.fixtureOrigin)}));
            if (!story) return false;
            await api.tabs.update(story.id, { active: true });
            location.reload();
            return true;
        `);
        await waitFor(harness, `document.body.dataset.state === "story"`, 20_000);

        const result = await harness.script(`
            return JSON.stringify({
                state: document.body.dataset.state,
                title: document.querySelector(".popup-card-title")?.textContent ?? "",
                author: document.querySelector(".popup-card-subtitle")?.textContent ?? "",
                chapters: document.querySelector(".popup-card-chapters")?.textContent ?? "",
                cardHidden: document.querySelector(".popup-card")?.hidden,
            });
        `);
        const data = JSON.parse(result);
        assertEqual(data.state, "story", "The popup should recognise the story.");
        assertEqual(data.cardHidden, false, "The story card should be visible.");
        assert(
            data.title.includes("Kintsugi Test Novel"),
            `The title is wrong (got "${data.title}").`,
        );
        assert(data.author.includes("Fixture"), `The author is missing (got "${data.author}").`);
        assert(
            data.chapters.includes("12"),
            `The chapter count is wrong (got "${data.chapters}").`,
        );
    });

    // -----------------------------------------------------------------
    // The workbench
    // -----------------------------------------------------------------
    console.log("\nThe workbench");

    await harness.setViewport(1440, 900);
    await harness.goto(`workbench.html?url=${encodeURIComponent(`${harness.fixtureOrigin}/`)}`);
    await waitFor(
        harness,
        `document.querySelector(".chapters-header__count")?.textContent?.includes("12")`,
    );

    await check("loads the story's metadata", async () => {
        const result = await harness.script(`
            return JSON.stringify({
                title: document.querySelector("#story-title")?.value ?? "",
                author: document.querySelector("#story-author")?.value ?? "",
                count: document.querySelector(".chapters-header__count")?.textContent ?? "",
                filename: document.querySelector("#story-filename")?.value ?? "",
            });
        `);
        const data = JSON.parse(result);
        assert(
            data.title.includes("Kintsugi Test Novel"),
            `The title is wrong (got "${data.title}").`,
        );
        assert(data.author.includes("Fixture"), `The author is wrong (got "${data.author}").`);
        assert(data.count.includes("12"), `The chapter count is wrong (got "${data.count}").`);
        assert(data.filename.endsWith(".epub"), `The file name is wrong (got "${data.filename}").`);
    });

    await check("lists every chapter with an absolute URL", async () => {
        const result = await harness.asyncScript(`
            const api = globalThis.browser ?? globalThis.chrome;
            const response = await api.runtime.sendMessage({
                type: "chapters:list",
                payload: { url: ${JSON.stringify(`${harness.fixtureOrigin}/`)} },
                id: "e2e-chapters",
            });
            const chapters = response?.result?.chapters ?? [];
            return JSON.stringify({
                count: chapters.length,
                relative: chapters.filter((chapter) => !chapter.sourceUrl.startsWith("http")).length,
                first: chapters[0]?.sourceUrl ?? "",
            });
        `);
        const data = JSON.parse(result);
        assertEqual(data.count, 12, "The chapter list has the wrong length.");
        assertEqual(data.relative, 0, "Some chapter URLs are relative.");
        assert(
            data.first.endsWith("/chapter/1"),
            `The first chapter URL is wrong (got "${data.first}").`,
        );
    });

    await check("selects, clears and inverts the selection", async () => {
        const selectedCount = async () =>
            Number(
                await harness.script(`
                    const list = document.querySelector("k-list");
                    return list ? list.selectedCount : -1;
                `),
            );

        /**
         * Click a button in the chapter list's toolbar.
         *
         * @param {number} index The button's index.
         * @returns {Promise<void>} A promise that resolves once it is clicked.
         */
        const click = async (index) => {
            await harness.script(`
                const toolbar = document.querySelector(".chapters-toolbar");
                const buttons = Array.from(toolbar?.querySelectorAll("k-button") ?? []);
                buttons[${index}].click();
                return true;
            `);
            await sleep(250);
        };

        // Every chapter starts selected, because the parser did not mark any of
        // them as locked.
        assertEqual(await selectedCount(), 12, "The chapters did not start selected.");

        await click(1); // "Select none"
        assertEqual(await selectedCount(), 0, "Clearing the selection left something selected.");

        await click(2); // "Invert"
        assertEqual(
            await selectedCount(),
            12,
            "Inverting an empty selection did not select everything.",
        );

        await click(0); // "Select all"
        assertEqual(await selectedCount(), 12, "Selecting all did not select everything.");
    });

    await check("filters the chapter list", async () => {
        await harness.script(`
            const toolbar = document.querySelector(".chapters-toolbar");
            const buttons = Array.from(toolbar?.querySelectorAll("k-button") ?? []);
            buttons[buttons.length - 1].click();
            return true;
        `);
        await sleep(400);

        const open = await harness.script(`
            const dialog = document.querySelector("k-dialog");
            return Boolean(dialog?.hasAttribute("open"));
        `);
        assert(open, "The filter dialog did not open.");

        await harness.script(`
            const field = document.querySelector("#filter-search");
            field.value = "Chapter 1:";
            field.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await sleep(500);

        const preview = await harness.script(`
            return JSON.stringify({
                count: document.querySelector(".filter-count")?.textContent ?? "",
                errorHidden: document.querySelector(".filter-error")?.hidden,
            });
        `);
        const previewData = JSON.parse(preview);
        assertEqual(previewData.errorHidden, true, "The filter reported an error.");
        assert(
            previewData.count.includes("1"),
            `The filter did not preview the match count correctly (got "${previewData.count}").`,
        );

        // Applying the filter narrows the list, without touching the selection.
        await harness.script(`
            const dialog = document.querySelector("k-dialog");
            const footer = dialog.querySelector('[slot="footer"]');
            const apply = Array.from(footer?.querySelectorAll("k-button") ?? []).at(-1);
            apply.click();
            return true;
        `);
        await sleep(500);

        const applied = await harness.script(`
            return JSON.stringify({
                count: document.querySelector(".chapters-header__count")?.textContent ?? "",
                open: Boolean(document.querySelector("k-dialog")?.hasAttribute("open")),
            });
        `);
        const appliedData = JSON.parse(applied);
        assert(
            appliedData.count.startsWith("1 of 12"),
            `The filter did not narrow the list (got "${appliedData.count}").`,
        );
        assertEqual(
            appliedData.open,
            false,
            "The dialog did not close when the filter was applied.",
        );

        // Put the list back, so the later checks see every chapter.
        await harness.script(`
            const toolbar = document.querySelector(".chapters-toolbar");
            const buttons = Array.from(toolbar?.querySelectorAll("k-button") ?? []);
            buttons[buttons.length - 1].click();
            return true;
        `);
        await sleep(400);
        await harness.script(`
            const dialog = document.querySelector("k-dialog");
            const footer = dialog.querySelector('[slot="footer"]');
            const clear = Array.from(footer?.querySelectorAll("k-button") ?? [])[0];
            clear.click();
            dialog.close();
            return true;
        `);
        await sleep(500);
    });

    // -----------------------------------------------------------------
    // The options page
    // -----------------------------------------------------------------
    console.log("\nThe settings");

    await harness.setViewport(1280, 900);
    await harness.goto("options.html");
    await sleep(1200);

    await check("groups the settings and filters them with the search", async () => {
        const before = await harness.script(`
            return JSON.stringify({
                groups: document.querySelectorAll(".options-group").length,
                links: document.querySelectorAll(".options-nav-link").length,
            });
        `);
        const beforeData = JSON.parse(before);
        assert(beforeData.groups > 0, "The settings page has no groups.");
        assert(beforeData.links > 0, "The settings page has no navigation.");

        await harness.script(`
            const search = document.querySelector(".options-search-input");
            search.value = "zzzz-not-a-setting";
            search.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await sleep(400);
        const empty = await harness.script(`
            const noResults = document.querySelector(".options-no-results");
            return JSON.stringify({
                visible: noResults ? !noResults.hidden : false,
                groups: document.querySelectorAll(".options-group").length,
            });
        `);
        const data = JSON.parse(empty);
        assert(data.visible, "Searching for nothing did not show the empty state.");
        assertEqual(data.groups, 0, "The groups were not hidden by the search.");

        await harness.script(`
            const search = document.querySelector(".options-search-input");
            search.value = "";
            search.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        `);
        await sleep(300);
    });

    await check("applies a theme change live", async () => {
        await writeAppearance(harness, { theme: "dark" });
        await harness.goto("options.html");
        await sleep(800);
        const theme = await harness.script(`
            return document.documentElement.dataset.theme ?? "";
        `);
        assertEqual(theme, "dark", "The dark theme was not applied.");

        await writeAppearance(harness, { theme: "light" });
    });

    // -----------------------------------------------------------------
    // The onboarding
    // -----------------------------------------------------------------
    console.log("\nThe onboarding");

    await harness.setViewport(1100, 820);
    await harness.goto("onboarding.html");
    await sleep(800);

    await check("walks through its three steps", async () => {
        const step = async () =>
            Number(
                await harness.script(
                    `return document.querySelector(".onboarding-stage")?.dataset.step ?? -1;`,
                ),
            );

        assertEqual(await step(), 0, "The onboarding does not start on the first step.");

        await harness.script(
            `document.querySelector('[data-action="next"]').click(); return true;`,
        );
        await sleep(300);
        assertEqual(await step(), 1, "The next button did not advance the onboarding.");

        await harness.script(
            `document.querySelector('[data-action="back"]').click(); return true;`,
        );
        await sleep(300);
        assertEqual(await step(), 0, "The back button did not go back.");

        await harness.script(
            `document.querySelector('[data-action="next"]').click(); return true;`,
        );
        await sleep(300);
        await harness.script(
            `document.querySelector('[data-action="next"]').click(); return true;`,
        );
        await sleep(300);
        assertEqual(await step(), 2, "The onboarding did not reach its last step.");

        const skipHidden = await harness.script(`
            return Boolean(document.querySelector('[data-action="skip"]')?.hidden);
        `);
        assert(skipHidden, "The skip button is still offered on the last step.");
    });

    await check("applies the accent the user picks", async () => {
        await harness.script(`
            const groups = document.querySelectorAll("k-radio-group");
            const accent = groups[1];
            const radio = accent.shadowRoot.querySelector('input[value="plum"]');
            radio.click();
            return true;
        `);
        await sleep(400);
        const accent = await harness.script(`
            return document.documentElement.dataset.accent ?? "";
        `);
        assertEqual(accent, "plum", "The chosen accent was not applied.");
    });

    // -----------------------------------------------------------------
    // Accessibility
    // -----------------------------------------------------------------
    console.log("\nAccessibility");

    await harness.goto("popup.html");
    await sleep(800);

    await check("gives every control an accessible name", async () => {
        const unnamed = await harness.script(`
            const SELECTOR = "button, input, select, textarea, a[href], [role='button'], [role='switch']";
            const controls = [];
            const walk = (root) => {
                for (const element of root.querySelectorAll(SELECTOR)) {
                    if (element.closest("[hidden]")) continue;
                    controls.push(element);
                }
                for (const element of root.querySelectorAll("*")) {
                    if (element.shadowRoot) walk(element.shadowRoot);
                }
            };
            walk(document);

            const nameOf = (element) => {
                const label = element.getAttribute("aria-label");
                if (label && label.trim()) return label.trim();

                const labelledBy = element.getAttribute("aria-labelledby");
                if (labelledBy) {
                    const text = labelledBy
                        .split(/\\s+/)
                        .map((id) => document.getElementById(id)?.textContent ?? "")
                        .join(" ")
                        .trim();
                    if (text) return text;
                }

                if (element.labels && element.labels.length > 0) {
                    const text = Array.from(element.labels)
                        .map((entry) => entry.textContent ?? "")
                        .join(" ")
                        .trim();
                    if (text) return text;
                }

                const title = element.getAttribute("title");
                if (title && title.trim()) return title.trim();

                let text = (element.textContent ?? "").trim();
                if (!text && element.querySelector("slot")) {
                    text = (element.getRootNode().host?.textContent ?? "").trim();
                }
                return text;
            };

            const bad = controls
                .filter((control) => nameOf(control).length === 0)
                .map((control) => control.tagName.toLowerCase());
            return JSON.stringify(bad);
        `);
        const bad = JSON.parse(unnamed);
        assertEqual(bad.length, 0, `Some controls have no accessible name: ${bad.join(", ")}`);
    });

    await check("shows a focus ring on the focused control", async () => {
        // A real key press is needed: `:focus-visible` only matches when the
        // browser believes the user is navigating by keyboard, and a
        // programmatic focus does not tell it that.
        await harness.script(`
            document.body.focus();
            return true;
        `);
        await harness.sendKey("\uE004");
        await sleep(300);

        const outline = await harness.script(`
            const active = document.activeElement;
            const inner = active?.shadowRoot?.querySelector("button") ?? active;
            const style = getComputedStyle(inner);
            return JSON.stringify({
                tag: active?.tagName?.toLowerCase() ?? "",
                shadow: style.boxShadow,
                outline: style.outlineStyle,
                width: style.outlineWidth,
            });
        `);
        const data = JSON.parse(outline);
        assert(
            data.tag.includes("k-") || data.tag === "button",
            `The keyboard did not reach a control (active element: "${data.tag}").`,
        );
        assert(
            (data.shadow && data.shadow !== "none") ||
                (data.outline !== "none" && data.width !== "0px"),
            `The focus ring is not visible (box-shadow: ${data.shadow}, outline: ${data.outline} ${data.width}).`,
        );
    });

    await check("respects the reduced-motion preference", async () => {
        await writeAppearance(harness, { reduceMotion: true });
        await harness.goto("popup.html");
        await sleep(800);

        const duration = await harness.script(`
            const button = document.querySelector(".popup-settings");
            const inner = button?.shadowRoot?.querySelector("button") ?? button;
            const style = getComputedStyle(inner);
            return JSON.stringify({
                transition: style.transitionDuration,
                attribute: document.documentElement.dataset.reduceMotion,
            });
        `);
        const data = JSON.parse(duration);
        assertEqual(
            data.attribute,
            "true",
            "The reduced-motion switch did not reach the document.",
        );
        assert(
            /^(0s|0\.001s)(,\s*(0s|0\.001s))*$/.test(data.transition),
            `Transitions are still running with reduced motion on (${data.transition}).`,
        );

        await writeAppearance(harness, { reduceMotion: false });
    });

    console.log(
        failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) failed.`,
    );
    return failures.length;
}
