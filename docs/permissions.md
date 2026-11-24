# Permissions rationale

Version 2.0 · Status: **authoritative**

Every permission the extension asks for is listed here, with the reason it
exists, the code that uses it, and what the extension does **not** do with it.

This document is the user-facing companion to
[ADR-0007](./decisions/ADR-0007-permissions.md), which records the decision
itself.

---

## 1. The short version

|                           | Baseline (WebToEpub 1.x)           | Kintsugi 2.0                           |
| ------------------------- | ---------------------------------- | -------------------------------------- |
| Permissions               | 7                                  | **5**                                  |
| Static host permissions   | `<all_urls>` (every site, forever) | **none**                               |
| Optional host permissions | —                                  | `*://*/*`, granted per site, revocable |
| Telemetry                 | none                               | none                                   |
| Accounts / sync           | none                               | none                                   |

Kintsugi asks for **fewer** permissions than the baseline and removes the
broadest one of all — the permanent grant to every site on the web.

---

## 2. Permissions requested at install time

### `downloads`

**Why.** The product's entire output is a file. `browser.downloads.download` is
the only supported way for an extension to write a file the user can open in
their operating system.

**Where.** `src/core/epub/save.ts` — the final step of every pack.

**What we do not do with it.** We never read the user's download history, we
never touch files that did not come from this extension, and we never set a
default download directory. The file is written with a filename the user
controls, into whatever folder their browser is already configured to use.

**Without it.** The product does not exist.

---

### `scripting`

**Why.** To read the source page the way the _user_ sees it. Many novel sites
render chapter content with JavaScript, so the HTML that `fetch` returns is an
empty shell. The extension must inject a small script into the tab and read the
live DOM.

**Where.** `src/core/page/dom-reader.ts` — injected on demand by the workbench
when it opens for a page.

**What we do not do with it.** The injected script is a **reader**: it extracts
the DOM and sends it back. It does not modify the page, does not inject UI
into the page, does not read other tabs, and does not observe navigation.

**Without it.** The extension would only work on server-rendered sites — a
small fraction of the 434 supported sites.

---

### `storage`

**Why.** Preferences, the per-site parser configurations saved by the selector
builder, and the reading list's metadata.

**Where.** `src/core/storage/settings-store.ts`.

**What we do not do with it.** Settings are stored under a single namespaced
key (`kintsugi.settings`) and are **validated against a schema on read**. The
library's EPUB bytes are _not_ stored here — they live in IndexedDB, which is
why `unlimitedStorage` is not needed. Nothing is synced, and nothing leaves the
machine.

**Without it.** The extension cannot remember a theme or an accent colour.

---

### `declarativeNetRequest`

**Why.** Two jobs, both narrow:

1. **Origin stripping.** The baseline used the far broader `webRequest`
   permission to strip the `Origin: moz-extension://…` header from
   extension-originated requests, because some protected sites reject requests
   carrying an extension origin. A static DNR rule expresses the same thing
   inside the network stack, matched by **initiator domain** — it applies only
   to requests this extension originates, and to nothing else in the browser.
2. **Header spoofing.** Some Cloudflare-protected sites require a plausible
   `Referer` and `Sec-Fetch-*` set. Kintsugi installs a **session-scoped** DNR
   rule for the duration of a download and removes it afterwards.

**Where.** `src/core/net/dnr-rules.ts`.

**What we do not do with it.** Rules are either static and scoped to the
extension's own ID, or session-scoped and torn down when the download ends.
We never install a rule that matches other extensions' traffic, and we never
inspect response bodies.

**Without it.** A meaningful subset of protected sites refuse to be read.

---

### `cookies`

**Why.** Some protected sites authenticate the page with a **partitioned**
(CHIPS) cookie. A request made from the extension's own context does not
receive that partitioned cookie, so the site returns a login page instead of
the chapter. Kintsugi copies the relevant cookies into an unpartitioned cookie
for the duration of the fetch, then **removes them in a `finally` block** — even
if the request throws.

**Where.** `src/core/net/cookie-bridge.ts`.

**What we do not do with it.**

- We only ever touch cookies whose domain matches the **registrable domain of
  the URL currently being fetched**. We do not enumerate the cookie jar.
- We only ever **read** cookies the browser has already stored for that site;
  we do not fabricate session cookies.
- The copied cookies are **always removed** afterwards, including on failure.
  The baseline leaked them when a fetch threw — a defect we do not reproduce.
- We never transmit cookies anywhere except the origin they came from.

**Without it.** A meaningful subset of protected sites is unreachable.

---

## 3. Host permissions

### The baseline granted `<all_urls>` — permanently

```json
"host_permissions": ["<all_urls>"]
```

This is a permanent, install-time grant to read and modify **every site the
user visits**, for the lifetime of the extension. It is the broadest privilege
in any browser extension, and it is granted before the user has read a single
line of the extension's description.

### Kintsugi grants host access per site, on request

```json
"host_permissions": [],
"optional_host_permissions": ["*://*/*"]
```

Host access is requested **at the moment the user chooses a site**, and only
for that site:

1. The user opens the workbench on a story page.
2. The extension checks whether it already holds access to that origin.
3. If not, it shows a one-line banner:
   _"Kintsugi needs access to `novelsite.com` to read the chapters."_
   with **Allow** and **Not now**.
4. **Allow** triggers Firefox's own permission prompt. **Not now** dismisses
   the banner and the workbench stays open, offering the selector builder as a
   degraded path.

Access is granted per **origin**, is listed in the options page, and can be
**revoked per site or entirely** from the same page.

**The consequence.** The extension holds access to the sites the user actually
reads, and to nothing else. A compromise of an extension page cannot read a
user's unrelated sites.

**The cost, stated honestly.** The first use on a new site costs one extra
click. This is a real trade, and the baseline's permanent blanket grant was
the wrong side of it.

---

## 4. Permissions the baseline had, and what happened to them

| Baseline permission     | Fate                          | Reason                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webRequest`            | **Removed**                   | Used for exactly one thing — stripping the extension's `Origin` header — which a scoped DNR rule does better. `webRequest` granted blocking read/write access to the headers of _every request in the browser_.         |
| `unlimitedStorage`      | **Removed**                   | Nothing called it. It existed only because the baseline stored EPUBs as base64 data URLs in `chrome.storage.local`, inflating them by a third and blowing past the per-item quota. IndexedDB stores the bytes directly. |
| `<all_urls>` (static)   | **Removed**                   | Replaced by optional, per-origin, revocable host access.                                                                                                                                                                |
| `cookies`               | **Kept**, behaviour tightened | Still required for protected sites, but now scoped to the registrable domain of the URL being fetched and cleaned up in a `finally`.                                                                                    |
| `downloads`             | **Kept**                      | The product's output.                                                                                                                                                                                                   |
| `scripting`             | **Kept**                      | Reading the live, JS-rendered DOM.                                                                                                                                                                                      |
| `storage`               | **Kept**                      | Preferences and per-site parser configs.                                                                                                                                                                                |
| `declarativeNetRequest` | **Kept**, scope made explicit | Header spoofing and the origin-stripping replacement for `webRequest`.                                                                                                                                                  |

**Net: 3 permissions removed, 0 added.**

---

## 5. Manifest settings

```json
{
    "manifest_version": 3,
    "permissions": [
        "downloads",
        "scripting",
        "storage",
        "declarativeNetRequest",
        "cookies"
    ],
    "host_permissions": [],
    "optional_host_permissions": ["*://*/*"],
    "content_security_policy": {
        "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none'"
    }
}
```

### Content Security Policy

`script-src 'self'` forbids inline scripts, `eval`, and any remote code. There
is no `'unsafe-eval'` and no `'unsafe-inline'` — the baseline needed
`'unsafe-inline'` only because it injected scripts by string concatenation.

`object-src 'none'` blocks plugins. `base-uri 'none'` prevents a `<base>` tag
from re-pointing relative URLs.

### Data collection

```json
"data_collection_permissions": { "required": ["none"], "optional": [] }
```

Kintsugi collects nothing. There is no telemetry, no crash reporting, no
account, no sync, and no server operated by the project. See
[PRIVACY.md](../PRIVACY.md).

### Incognito

`"incognito": "spanning"` — the extension sees private-browsing windows only
if the user explicitly enables it there. The baseline used `"split"`, which
gave the extension a separate, non-private view of private browsing.

---

## 6. Network requests the extension makes

| Request                 | When                            | To whom                                                                       |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Chapter HTML            | During a download               | The site being read — and only that site                                      |
| Chapter images          | During a download               | The same site, or a CDN it links to (requires host access to that origin)     |
| Table-of-contents pages | While building the chapter list | The site being read                                                           |
| Metadata lookup         | **Off by default**, user opt-in | A public metadata service — the story URL is sent only if the user enables it |

There is no analytics endpoint, no error-reporting endpoint, no update check,
and no "phone home" of any kind. The extension works fully offline once
installed.

---

## 7. Review checklist for contributors

Before adding a permission, the pull request must answer:

1. **What user-visible feature requires it?** If the answer is "none", do not
   add it.
2. **Can an existing permission express it?** See
   [ADR-0004](./decisions/ADR-0004-fetch-layer.md) for the fetch layer and
   [ADR-0007](./decisions/ADR-0007-permissions.md) for the permission model.
3. **Is it host-scoped?** If the feature touches user data on the web, it
   belongs in `optional_host_permissions`, requested per site — not in the
   install-time set.
4. **Is it documented here?** This document and the ADR index must be updated
   in the same commit.

---

## 8. Related documents

- [ADR-0007 — permissions](./decisions/ADR-0007-permissions.md)
- [ADR-0004 — fetch layer](./decisions/ADR-0004-fetch-layer.md)
- [Architecture: permissions and network reach](./architecture/README.md)
- [Privacy policy](../PRIVACY.md)
- [Security policy](../SECURITY.md)
