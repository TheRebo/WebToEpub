/**
 * The legacy default-parser adapters.
 *
 * The baseline's fallback parser had two companions:
 *
 *  - `DefaultParserSiteSettings`, which remembered the CSS selectors the user
 *    wrote for a host name, in `window.localStorage`;
 *  - `DefaultParserUI`, which asked the user for those selectors, in the
 *    baseline's popup page.
 *
 * The rewrite keeps the first and replaces the second:
 *
 *  - the settings now live in `browser.storage.local`, behind the typed
 *    {@link SiteSelectorStore}, because a background service worker has no
 *    `window`;
 *  - the user interface is the workbench's **site selector** panel, which the
 *    worker asks for when the default parser is the one that ran.
 *
 * The class names are kept, because the migrated `DefaultParser` refers to
 * them and the migrated parsers must keep working unchanged.
 *
 * See ADR-0011.
 */

"use strict";

import { util } from "./legacy-util";
import { siteSelectors } from "../../storage/site-selectors";
import type { SiteSelectorConfig } from "../../storage/site-selectors-store";
import { normaliseHostName } from "../../storage/site-selectors-store";

/** The logic a site needs to find its content, title and junk. */
export interface DefaultParserLogic {
    /** Find the element that holds the chapter's body. */
    findContent(dom: Document): Element | null;
    /** Find the element that holds the chapter's title. */
    findChapterTitle(dom: Document): Element | null;
    /** Remove the elements the user does not want. */
    removeUnwanted(element: Element): void;
}

/**
 * The saved selectors, per host name.
 */
export class DefaultParserSiteSettings {
    /** The saved configurations. */
    configs = new Map<string, SiteSelectorConfig>();

    constructor() {
        this.loadSiteConfigs();
    }

    /** Load the saved configurations from the store. */
    loadSiteConfigs(): void {
        this.configs = new Map(siteSelectors.peekAll());
    }

    /**
     * The key a host name is stored under.
     *
     * The migrated `DefaultParser` looks a host name up with
     * `util.extractHostName`, which returns the raw host name — `www.` and
     * all. The store strips `www.`, so a lookup that used the raw name would
     * never find what was saved. The key is normalised here, in one place, so
     * the migrated parser and the rewritten one agree.
     */
    #key(hostname: string): string {
        return normaliseHostName(hostname);
    }

    /** Whether a configuration can be used. */
    static isConfigValid(selectors: SiteSelectorConfig): boolean {
        return selectors.contentCss !== undefined && !util.isNullOrEmpty(selectors.contentCss);
    }

    /**
     * Save the selectors for a host name.
     *
     * The in-memory copy is updated immediately, so the next chapter is
     * handled with the new selectors; the write to storage happens in the
     * background.
     */
    saveSiteConfig(
        hostname: string,
        contentCss: string,
        titleCss: string,
        removeCss: string,
        testUrl: string,
    ): void {
        const key = this.#key(hostname);
        if (!this.isConfigChanged(key, contentCss, titleCss, removeCss, testUrl)) return;

        this.configs.set(key, { contentCss, titleCss, removeCss, testUrl });
        void siteSelectors.setForHost(key, { contentCss, titleCss, removeCss, testUrl });
    }

    /** Whether the selectors differ from the saved ones. */
    isConfigChanged(
        hostname: string,
        contentCss: string,
        titleCss: string,
        removeCss: string,
        testUrl: string,
    ): boolean {
        const config = this.configs.get(hostname);
        return (
            config === undefined ||
            contentCss !== config.contentCss ||
            titleCss !== config.titleCss ||
            removeCss !== config.removeCss ||
            testUrl !== config.testUrl
        );
    }

    /** The saved selectors for a host name. */
    getConfigForSite(hostname: string): SiteSelectorConfig | undefined {
        return this.configs.get(this.#key(hostname));
    }

    /**
     * The logic a host name needs.
     *
     * With no saved selectors the logic is the trivial one: the whole body is
     * the content, and there is no title. With saved selectors, each one is
     * applied — and a selector that the browser cannot parse is ignored
     * rather than allowed to break the chapter.
     */
    constructFindContentLogicForSite(hostname: string): DefaultParserLogic {
        const logic: DefaultParserLogic = {
            findContent: (dom: Document) => dom.querySelector("body"),
            findChapterTitle: () => null,
            removeUnwanted: () => undefined,
        };

        const config = this.getConfigForSite(hostname);
        if (config === undefined) return logic;

        if (!util.isNullOrEmpty(config.contentCss)) {
            logic.findContent = (dom: Document) => querySafely(dom, config.contentCss);
        }
        if (!util.isNullOrEmpty(config.titleCss)) {
            logic.findChapterTitle = (dom: Document) => querySafely(dom, config.titleCss);
        }
        if (!util.isNullOrEmpty(config.removeCss)) {
            logic.removeUnwanted = (element: Element) => {
                for (const node of queryAllSafely(element, config.removeCss)) node.remove();
            };
        }
        return logic;
    }
}

/** Query for the first element that matches, ignoring a bad selector. */
function querySafely(dom: Document, selector: string): Element | null {
    try {
        return dom.querySelector(selector);
    } catch {
        return null;
    }
}

/** Query for every element that matches, ignoring a bad selector. */
function queryAllSafely(element: Element, selector: string): Element[] {
    try {
        return Array.from(element.querySelectorAll(selector));
    } catch {
        return [];
    }
}

/**
 * The legacy default-parser UI.
 *
 * The baseline's version drew a panel inside the popup page and asked the
 * user for four text fields. The rewrite's version is the workbench's **site
 * selector** panel, which the user opens from a banner the workbench shows
 * when the default parser was used.
 *
 * This shim therefore does one thing: it records that the default parser ran
 * for a host name, so that the worker can tell the workbench to offer the
 * panel.
 */
export class DefaultParserUI {
    /** The host names the default parser was used for, most recent first. */
    static readonly usedForHosts: string[] = [];

    /**
     * Called when the default parser is set up for a host name.
     *
     * @param hostname The host name the parser was set up for.
     * @param _parser The parser.
     * @param _dom The page's DOM.
     */
    static setupDefaultParserUI(hostname: string, _parser: unknown, _dom: Document): void {
        DefaultParserUI.usedForHosts.unshift(hostname);
        DefaultParserUI.usedForHosts.length = Math.min(DefaultParserUI.usedForHosts.length, 20);
    }

    /** The baseline copied these instructions into the popup. There are none now. */
    static copyInstructions(): void {
        // The workbench explains the feature in its own words.
    }

    /** The baseline showed and hid a panel. There is no panel to show now. */
    static setDefaultParserUiVisibility(_visible: boolean): void {
        // The workbench's banner is shown by the workbench itself.
    }

    /** The baseline filled the panel's fields. The workbench's panel does that. */
    static populateDefaultParserUI(_hostname: string, _parser: unknown, _dom: Document): void {
        // The workbench asks the worker for suggestions when it opens the panel.
    }

    /** The baseline tested the selectors against the live page. */
    static testDefaultParser(_parser: unknown): void {
        // The workbench's panel has its own test button.
    }

    /** The baseline saved the selectors. */
    static onFinishedClicked(_parser: unknown): void {
        // The workbench saves them over the message bus.
    }
}
