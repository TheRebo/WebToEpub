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

/** The ID range reserved for session-scoped spoofing rules. */
const SESSION_RULE_ID_BASE = 1000;

/** The subset of the DNR API this module uses. */
export interface DnrApi {
    updateDynamicRules(options: {
        removeRuleIds: number[];
        addRules: DnrRule[];
    }): Promise<void>;
    getSessionRules(): Promise<{ id: number; condition: DnrCondition }[]>;
}

/** A DNR rule, as the API accepts it. */
export interface DnrRule {
    id: number;
    priority: number;
    action: DnrAction;
    condition: DnrCondition;
}

/** A rule action. */
export interface DnrAction {
    type: "modifyHeaders" | "block" | "allow" | "redirect";
    requestHeaders?: Array<{ header: string; operation: "set" | "remove" | "append" }>;
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
 * The static rule that strips the extension's own `Origin` header.
 *
 * The condition `initiatorDomains: [EXTENSION_ID]` means the rule applies
 * only to requests the extension itself originates — exactly the baseline's
 * intent, with a fraction of the permission.
 */
export function createOriginStripRule(extensionId: string): DnrRule {
    return {
        id: ORIGIN_STRIP_RULE_ID,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "Origin", operation: "remove" }],
        },
        condition: {
            initiatorDomains: [extensionId],
            resourceTypes: ["xmlhttprequest"],
        },
    };
}

/**
 * A session-scoped rule that spoofs the browser headers a protected site
 * expects.
 *
 * Some Cloudflare-protected sites reject a request that lacks a plausible
 * `Referer` and `Sec-Fetch-*` set. This rule is installed for the duration
 * of a download and removed afterwards.
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
                { header: "Referer", operation: "set", value: options.referer } as never,
                { header: "Sec-Fetch-Dest", operation: "set", value: "document" } as never,
                { header: "Sec-Fetch-Mode", operation: "set", value: "navigate" } as never,
                { header: "Sec-Fetch-Site", operation: "set", value: "same-origin" } as never,
            ],
        },
        condition: {
            initiatorDomains: [],
            resourceTypes: ["xmlhttprequest"],
            ...(options.requestDomains ? { requestDomains: options.requestDomains } : {}),
        },
    };
}

/** The manager for session-scoped rules. */
export class DnrRuleManager {
    #api: DnrApi | undefined;
    #extensionId: string;
    #active = new Map<string, number>();
    #nextId = SESSION_RULE_ID_BASE;

    constructor(extensionId: string, api?: DnrApi) {
        this.#extensionId = extensionId;
        this.#api = api;
    }

    /** The rule that replaces the baseline's `webRequest` listener. */
    get originStripRule(): DnrRule {
        return createOriginStripRule(this.#extensionId);
    }

    /**
     * Install a session-scoped spoofing rule for a domain.
     *
     * @returns The rule ID, so the rule can be removed later.
     */
    async installSpoofRule(domain: string, referer: string): Promise<number | null> {
        if (!this.#api) return null;
        const existing = this.#active.get(domain);
        if (existing !== undefined) return existing;

        const id = this.#nextId++;
        const rule = createSpoofRule(id, { referer, requestDomains: [domain] });
        rule.condition.initiatorDomains = [this.#extensionId];

        try {
            await this.#api.updateDynamicRules({ removeRuleIds: [], addRules: [rule] });
            this.#active.set(domain, id);
            return id;
        } catch {
            // If the rule cannot be installed, the download proceeds without
            // spoofing. Some sites do not need it.
            return null;
        }
    }

    /** Remove the spoofing rule for a domain. */
    async removeSpoofRule(domain: string): Promise<void> {
        if (!this.#api) return;
        const id = this.#active.get(domain);
        if (id === undefined) return;
        try {
            await this.#api.updateDynamicRules({ removeRuleIds: [id], addRules: [] });
        } catch {
            // Best effort.
        }
        this.#active.delete(domain);
    }

    /** Remove every session rule this manager installed. */
    async removeAll(): Promise<void> {
        if (!this.#api) return;
        const ids = [...this.#active.values()];
        if (ids.length === 0) return;
        try {
            await this.#api.updateDynamicRules({ removeRuleIds: ids, addRules: [] });
        } catch {
            // Best effort.
        }
        this.#active.clear();
    }
}
