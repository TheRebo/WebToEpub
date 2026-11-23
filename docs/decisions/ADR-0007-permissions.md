# ADR-0007 — Reduce the permission set and make host access optional

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0004](ADR-0004-fetch-layer.md)

---

## Context

The baseline manifest requests seven permissions plus a blanket host grant:

```json
"permissions": [
  "cookies", "downloads", "webRequest",
  "declarativeNetRequest", "scripting", "storage", "unlimitedStorage"
],
"host_permissions": ["<all_urls>"]
```

Two of these are disproportionate to what the code needs, and both were
flagged in the technical audit:

### `webRequest` — too broad

`Firefox.startWebRequestListeners` registers

```ts
browser.webRequest.onBeforeSendHeaders.addListener(
    Firefox.filterHeaders,
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"],
);
```

This grants **blocking read/write access to the headers of every HTTP request
the browser makes**, on every origin, in order to do exactly one thing: strip
`Origin: moz-extension://` from extension-originated fetches
(`Firefox.js:14-19`). The filter _is_ narrow — it only removes an `Origin`
that starts with `moz-extension://` — but the _grant_ is the broadest thing
in the manifest.

Note also that MV3 Chrome does not support blocking `webRequest` for
non-extension traffic at all, so the permission is inert there while still
being displayed to users.

The extension **already declares `declarativeNetRequest`**, and
`HttpClient.setDeclarativeNetRequestRules` already uses it with the correct
`initiatorDomains` restriction to the extension's own ID. DNR's
`modifyHeaders` action can express the origin-stripping rule exactly, scoped
to extension-initiated requests only.

### `unlimitedStorage` — caused by an implementation choice

Nothing in the code calls `unlimitedStorage`. It is required only because
the library stores EPUBs as **base64 data URLs** in `chrome.storage.local`
(`Library.js:874-879`). That representation inflates size by ~33 % and
exceeds the 10 MB per-item quota, forcing the blanket permission.

As decided in [ADR-0006](ADR-0006-storage.md), the library moves to
IndexedDB, which stores bytes natively and has no per-item limit. The
permission becomes unnecessary.

### `cookies` — behaviourally narrow, granted unscoped

The code only ever touches cookies for the registrable domain of the URL
being fetched (`HttpClient.js:285-288`), and it is required for a meaningful
subset of Cloudflare-protected sites. The _grant_ is unscoped, but the
_behaviour_ is narrow, and the behaviour is correctable within the same
permission.

### `<all_urls>` — inherent, but should be opt-in

Fetching arbitrary chapter and image hosts is the product. But a **static**
`<all_urls>` grant is permanent, while the user only needs access to the
sites they actually read. `optional_host_permissions` lets us ask for access
to a specific origin at the moment the user chooses that site.

## Decision

### Target permission set

```json
"permissions": [
  "downloads",
  "scripting",
  "storage",
  "declarativeNetRequest",
  "cookies"
],
"optional_host_permissions": ["*://*/*"],
"host_permissions": []
```

**Three permissions removed** (`webRequest`, `unlimitedStorage`, and the
static `<all_urls>`), **none added.**

### Permission-by-permission justification

| Permission              | Why it is needed                                                                                                                           | Why it is justified                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `downloads`             | Save the generated EPUB to disk                                                                                                            | The product's output. `chrome.downloads.download` is the only supported way to write a file the user can open.                                                                                          |
| `scripting`             | Inject a content script into the source tab to read its live, JS-rendered DOM                                                              | The extension must read the DOM _as the user sees it_, including content injected by the site's own scripts. A plain `fetch` would miss it.                                                             |
| `storage`               | Preferences, reading list, per-host parser configs                                                                                         | Small structured settings. `browser.storage.local` is the only extension-scoped key/value store.                                                                                                        |
| `declarativeNetRequest` | Header spoofing (`Referer`, `Sec-Fetch-*`) for Cloudflare-protected sites; and the scoped origin-stripping rule that replaces `webRequest` | Session-scoped rules, restricted to the extension's own `initiatorDomains`. No persistent or global effect.                                                                                             |
| `cookies`               | Copy the site's partitioned (CHIPS) cookies into unpartitioned cookies so extension-context fetches authenticate                           | Required for a meaningful subset of protected sites. Behaviourally scoped to the registrable domain of the URL being fetched; cookies are removed in a `finally` ([ADR-0004](ADR-0004-fetch-layer.md)). |

### Optional host permissions

The extension requests host access **per site, at the moment the user picks
it**:

1. The user clicks the toolbar button on a story page.
2. The extension checks whether it already has host access for that origin.
3. If not, it shows a **one-line, non-blocking banner**: _"Kintsugi needs
   access to `novelsite.com` to read the chapters. [Allow] [Not now]"_.
4. On "Allow", `browser.permissions.request({ origins: [...] })` prompts the
   browser's own permission UI and the grant is persisted.

Sites the user has already approved are listed in the options page, with a
"Revoke access" action per site and a "Revoke all" action.

The consequence: the extension holds access to the sites the user reads, and
nothing else. A compromise of the extension page cannot read arbitrary sites.

### The replacement for `webRequest`

```ts
// Strip the extension's own Origin header so protected sites accept the request.
const ORIGIN_STRIP_RULE: Rule = {
    id: ORIGIN_STRIP_RULE_ID, // owned by this extension
    priority: 1,
    action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "Origin", operation: "remove" }],
    },
    condition: {
        initiatorDomains: [EXTENSION_ID],
        resourceTypes: ["xmlhttprequest"],
    },
};
```

The condition `initiatorDomains: [EXTENSION_ID]` means the rule applies
**only to requests the extension itself originates** — exactly the baseline's
intent, with a fraction of the permission. The rule is installed once at
startup as a **persistent** static rule (`declarativeNetRequest` static rules
survive service-worker restarts, unlike session rules).

### Declarative host permission for the DNR rule

Because the DNR rule only ever needs to affect extension-initiated requests,
we use `declarativeNetRequestWithHostAccess` semantics where available so the
rule does not itself require a broad host grant.

## Alternatives considered

| Alternative                                                          | Why rejected                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep `webRequest`**                                                | The narrowest fix in the product is also the broadest permission. DNR expresses the same rule with a scoped condition.                                |
| **Keep `unlimitedStorage`**                                          | Only needed because of the base64 library representation. IndexedDB removes the cause.                                                                |
| **Keep `<all_urls>` static**                                         | Simpler, but grants permanent access to every site for no reason. The optional flow is a one-line banner plus the browser's own prompt.               |
| **Drop `cookies` too**                                               | Would break a meaningful subset of Cloudflare-protected sites — a product regression for a permission that is behaviourally narrow and now leak-free. |
| **Use `webRequest` only in Firefox, DNR elsewhere**                  | Two mechanisms for one rule doubles the surface and the testing. One mechanism, scoped, is better.                                                    |
| **Request host access for every site the user visits automatically** | Firefox requires a user gesture for `permissions.request`; auto-requesting is not possible and would be an abuse of the prompt.                       |

## Consequences

**Positive**

- **Three fewer permissions**, and the two removed were the two broadest.
- The extension's access to the user's browsing is now proportional to what
  they actually use.
- The origin-stripping rule is **more precise** than the baseline's: the
  baseline filtered by header _value_ at runtime, which is a string
  comparison on every request in the browser; the DNR rule is matched by
  initiator domain in the network stack.
- A static DNR rule survives service-worker restarts; the baseline's
  `webRequest` listener was re-registered on every page load.

**Negative**

- The first use on a new site shows a permission banner. This is a real UX
  cost — one extra click, once per site.
- `optional_host_permissions` requires a **user gesture**, so the request
  must originate from a click handler.
- Sites that are already granted must be listed and revocable, which is new
  UI.

**Neutral**

- The manifest keeps `data_collection_permissions: { required: ["none"] }`
  exactly as the baseline had it. No telemetry is added.
