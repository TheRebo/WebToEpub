/**
 * Declarative Net Request rules.
 *
 * The baseline used the `webRequest` permission to strip the extension's own
 * `Origin` header from every request it made — a permanent, install-time
 * grant to read and modify the headers of every HTTP request in the
 * browser, in order to do one narrowly-scoped thing.
 *
 * DNR expresses the same rule inside the network stack, matched by
 * *initiator domain*, so it can only ever affect requests this extension
 * originates.
 *
 * See ADR-0007 and SECURITY.md §3.8.
 */

/** The ID of the static origin-stripping rule. */
export const ORIGIN_STRIP_RULE_ID = 1;

/** The subset of the DNR API this module uses. */
export interface DnrApi {
    updateDynamicRules(options: { removeRuleIds?: number[]; addRules?: DnrRule[] }): Promise<void>;
    getDynamicRules(): Promise<{ id: number }[]>;
}

/** A DNR rule, as the API accepts it. */
export interface DnrRule {
    id: number;
    priority: number;
    action: DnrAction;
    condition: DnrCondition;
}

/**
 * A rule action.
 *
 * The `value` field is what makes a header *set* different from a header
 * *remove*, so it is part of the type rather than an escape hatch.
 */
export interface DnrAction {
    type: "modifyHeaders" | "block" | "allow" | "redirect";
    requestHeaders?: Array<{
        header: string;
        operation: "set" | "remove" | "append";
        /** The header's new value. Required for `set` and `append`. */
        value?: string;
    }>;
}

/** A rule condition. */
export interface DnrCondition {
    /** Only requests from these initiator domains match. */
    initiatorDomains?: string[];
    /** Only requests to these resource types match. */
    resourceTypes?: string[];
    /** Only requests whose URL matches these patterns match. */
    urlFilter?: string;
    /** Only requests to these domains match. */
    requestDomains?: string[];
    /** Only requests with these methods match. */
    requestMethods?: string[];
}

/**
 * The domain a declarative network request rule must name to be scoped to
 * this extension's own requests.
 *
 * Firefox validates every `initiatorDomains` entry as a *canonical domain*:
 * the value has to be exactly what `new URL("http://" + value).hostname`
 * produces. The extension's add-on ID is **not** such a value — this project's
 * ID is `kintsugi@localhost`, and `new URL("http://kintsugi@localhost")` is
 * `localhost`, not `kintsugi@localhost`. Firefox rejects the rule outright:
 *
 *     Invalid domain kintsugi@localhost
 *
 * The value that *is* a canonical domain, and the one Firefox actually
 * derives the initiator from, is the host of the extension's own origin: the
 * per-profile UUID in `moz-extension://<uuid>/`. On Chromium the same
 * expression yields the extension ID, which is the initiator there too — so
 * one expression is correct on both.
 *
 * @returns The host, or an empty string when it cannot be determined.
 */
export function initiatorDomain(): string {
    try {
        const api = globalThis as unknown as {
            browser?: { runtime?: { getURL?(path: string): string } };
            chrome?: { runtime?: { getURL?(path: string): string } };
        };
        const getURL = api.browser?.runtime?.getURL ?? api.chrome?.runtime?.getURL;
        if (!getURL) return "";
        const host = new URL(getURL("")).hostname;
        return host;
    } catch {
        return "";
    }
}

/**
 * A rule condition scoped to this extension's own requests.
 *
 * The `initiatorDomains` key is **omitted** rather than set to an empty array
 * when the domain cannot be determined: Firefox's schema requires at least
 * one entry, so an empty array is rejected just as firmly as a bad one. A rule
 * with no initiator condition would match every request in the browser, so it
 * is not installed at all in that case — an unscoped rule would be worse than
 * no rule.
 *
 * @param resourceTypes The resource types the rule applies to.
 * @returns The condition.
 */
function scopedCondition(resourceTypes: string[]): DnrCondition {
    const domain = initiatorDomain();
    return domain ? { initiatorDomains: [domain], resourceTypes } : { resourceTypes };
}

/**
 * The static rule that strips the extension's own `Origin` header.
 *
 * The condition names this extension's own origin as the initiator, so the
 * rule applies only to requests the extension itself originates — exactly the
 * baseline's intent, with a fraction of the permission.
 */
export function createOriginStripRule(): DnrRule {
    return {
        id: ORIGIN_STRIP_RULE_ID,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "Origin", operation: "remove" }],
        },
        condition: scopedCondition(["xmlhttprequest"]),
    };
}

/**
 * A session-scoped rule that spoofs the browser headers a protected site
 * expects.
 *
 * Some Cloudflare-protected sites reject a request that lacks a plausible
 * `Referer` and `Sec-Fetch-*` set. This rule is installed for the duration
 * of a download and removed afterwards.
 *
 * The migrated parsers install their own spoofing rules through the legacy
 * client's `setDeclarativeNetRequestRules`, which uses the browser's
 * *session* rules. This helper builds the same rule for the *dynamic* rule
 * set, which is where the origin-stripping rule lives, so that both kinds
 * of rule can be installed side by side.
 */
export function createSpoofRule(
    id: number,
    options: { referer: string; requestDomains?: string[] },
): DnrRule {
    return {
        id,
        priority: 2,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "Referer", operation: "set", value: options.referer },
                { header: "Sec-Fetch-Dest", operation: "set", value: "document" },
                { header: "Sec-Fetch-Mode", operation: "set", value: "navigate" },
                { header: "Sec-Fetch-Site", operation: "set", value: "same-origin" },
            ],
        },
        condition: {
            ...scopedCondition(["xmlhttprequest"]),
            ...(options.requestDomains ? { requestDomains: options.requestDomains } : {}),
        },
    };
}

/**
 * Install the origin-stripping rule.
 *
 * This is the rule that replaces the baseline's `webRequest` listener. The
 * baseline asked for the `webRequest` permission — a permanent grant to read
 * and modify the headers of *every* HTTP request in the browser — in order to
 * strip the extension's own `Origin` header from the requests it made. DNR
 * does the same thing inside the network stack, matched by initiator domain,
 * so it can only ever affect requests this extension originates.
 *
 * The rule is installed as a *dynamic* rule rather than a static one because
 * its condition depends on the extension's own origin, which is only known at
 * runtime. It is reinstalled on every worker start, because a dynamic rule
 * does not survive the worker being torn down.
 *
 * @param api The browser's DNR API.
 * @returns Whether the rule was installed.
 */
export async function installOriginStripRule(api: DnrApi | undefined): Promise<boolean> {
    if (!api) return false;

    // A rule with no initiator condition would match every request in the
    // browser, which is exactly the broad grant the baseline's `webRequest`
    // permission gave. Without a known origin there is no safe way to scope
    // it, so no rule is installed.
    if (!initiatorDomain()) return false;

    try {
        // The rule may already be installed from a previous worker start, so
        // the existing rules are cleared first. Only this extension's own
        // rules are in scope: the rule IDs are the extension's, and the
        // extension cannot see another extension's rules.
        const existing = await api.getDynamicRules();
        await api.updateDynamicRules({
            removeRuleIds: existing.map((rule) => rule.id),
            addRules: [createOriginStripRule()],
        });
        return true;
    } catch {
        // A browser without a working DNR API is not an error: the
        // extension still works, it just sends an `Origin` header.
        return false;
    }
}
