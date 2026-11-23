/**
 * The store the worker and the migrated parsers share.
 *
 * The site selectors live in one place: the background worker owns them, the
 * parsers read them through {@link siteSelectors}, and the extension pages
 * reach them through the message bus.
 */

import { localStorageAdapter } from "../browser-api";
import { SiteSelectorStore } from "./site-selectors-store";

/** The store. */
export const siteSelectors = new SiteSelectorStore(localStorageAdapter);
