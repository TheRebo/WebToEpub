# Security policy

Version 2.0 · Applies to: **Kintsugi** (the WebToEpub revamp)

---

## 1. Scope

This document describes how to report a security issue in Kintsugi, what the
project's security model is, and what the project considers in scope.

---

## 2. Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub's private vulnerability reporting on the
project repository, if that feature is enabled. If it is not, open a
**public issue that says only "security report available on request"**, with
no technical detail, and wait for a maintainer to open a private channel.

Please include:

- the Kintsugi version (Options → Advanced → Version, or the tag),
- the Firefox version,
- the site URL that triggered the problem, if any,
- a description of the issue and its impact,
- steps to reproduce, or a proof of concept.

You can expect an acknowledgement within **7 days** and a substantive reply
within **30 days**. We will keep you informed as the fix progresses, and we
will credit you in the advisory unless you prefer otherwise.

### What we consider a vulnerability

| In scope | Out of scope |
|---|---|
| Remote code execution in the extension context | A site blocking the extension from reading its content |
| Reading data from a site the user did not grant access to | The extension failing to parse a specific novel site |
| Leaking cookies, credentials, or browsing data | A parser returning incorrect chapter titles |
| Bypassing the Content Security Policy | A novel site serving misleading content to its own readers |
| Writing files outside the intended output | Slow performance on an unsupported or very large site |
| Privilege escalation between extension surfaces | Missing a parser for a site the user visits |

---

## 3. Security model

### 3.1 Trust boundaries

Kintsugi handles three distinct classes of data:

| Class | Examples | Trust |
|---|---|---|
| **The user's own settings** | Theme, accent, delays, custom selectors | Trusted |
| **Remote page content** | Chapter HTML, images, titles, covers | **Untrusted** |
| **The site's own cookies** | Session cookies for the site being read | **Untrusted** |

Remote page content is the primary risk. It is attacker-controlled by
definition — the site being read may be hostile, compromised, or simply
unrelated to what the user thinks it is.

### 3.2 Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none'"
}
```

- `script-src 'self'` — no inline scripts, no `eval`, no remote code, ever.
  The extension ships every line of code it runs.
- `object-src 'none'` — no plugins.
- `base-uri 'none'` — a `<base>` tag cannot re-point relative URLs.

### 3.3 DOM sanitisation

Untrusted page content is sanitised **at every boundary where it enters the
extension**:

- Chapter HTML is sanitised with DOMPurify before it is written into the
  EPUB's XHTML.
- Chapter text inserted into the UI is inserted as **text nodes**, never as
  `innerHTML`.
- The extension pages never use `innerHTML` with untrusted data.

The EPUB sanitiser allows a conservative subset: structural elements, text,
images, and inline formatting. It strips `<script>`, `<iframe>`, `<object>`,
event-handler attributes, and `javascript:` URLs.

### 3.4 URL validation

Every URL a parser returns — chapter URLs, image URLs, cover URLs — is
validated before it is fetched:

- parsed with `new URL`, which rejects malformed input,
- scheme allow-listed to `http:` and `https:`,
- checked against the registrable domain of the page being read, unless the
  user has granted access to that origin,
- `javascript:`, `data:`, `blob:`, and `file:` URLs are rejected outright.

### 3.5 Cookie handling

The cookie bridge exists because some protected sites authenticate the page
with a partitioned (CHIPS) cookie that extension-context requests do not
receive.

Its guarantees:

- only cookies whose domain matches the **registrable domain of the URL
  currently being fetched** are read,
- the copy is removed in a **`finally` block**, so it is removed even when
  the request throws — a defect present in the baseline,
- cookies are never sent to any origin other than the one they came from.

### 3.6 Storage

- Settings are validated against a **schema on read**. A value that does not
  match the schema is discarded and the default is used, rather than being
  merged into live state.
- Values read from storage are never `Object.assign`-ed onto a live object,
  which would permit prototype pollution.
- The library lives in IndexedDB and is written **transactionally**, so an
  interrupted write cannot leave a half-written book.

### 3.7 The selector builder

User-supplied CSS selectors are the one place a user can inject arbitrary
behaviour into the extension's own logic.

- Selectors are compiled with `document.querySelector`, which does not
  execute script.
- The builder operates on the **DOM of the page the user is already looking
  at**, in the page's own context — it does not fetch arbitrary URLs.
- Saved selectors are stored per hostname and are applied only to that
  hostname.

User-supplied **regular expressions** (in the chapter filter) are:

- compiled in a `try`, with the error shown inline rather than thrown,
- length-capped,
- executed with a timeout, so a catastrophic-backtracking pattern cannot
  freeze the UI.

### 3.8 Declarative Net Request

DNR rules are used for two things: stripping the extension's `Origin` header
from its own requests, and spoofing `Referer`/`Sec-Fetch-*` for protected
sites.

- The static rule's condition is `initiatorDomains: [EXTENSION_ID]`, so it
  can only ever affect requests this extension originates.
- The session rule is removed when a download finishes or is cancelled.
- The extension never installs a rule that inspects or modifies other
  extensions' traffic.

### 3.9 Least privilege

The extension requests **five** permissions and **no** static host
permissions. Host access is granted per site, on request, and is revocable.
The full rationale is in [`docs/permissions.md`](./docs/permissions.md) and
[ADR-0007](./docs/decisions/ADR-0007-permissions.md).

### 3.10 No remote code, no telemetry

- Every line of code the extension runs is in the package. There is no
  dynamic import from a network location, no eval, no remotely loaded script.
- There is no telemetry, no crash reporting, no analytics, and no account.
  See [`PRIVACY.md`](./PRIVACY.md).

---

## 4. Dependency policy

- Runtime dependencies are kept to a **minimum**: a ZIP writer and a DOM
  sanitiser. Both are vendored into the build output; neither is loaded from
  a CDN.
- Dependencies are pinned with exact versions and committed through a lockfile.
- `npm audit` runs in CI. A high-severity advisory fails the build.
- There is no automated dependency-update bot that merges without review.

---

## 5. Reporting a false positive

If a report turns out not to be a vulnerability, we will say so plainly and
explain why, and we will not take any action against the reporter.

---

## 6. Security-related ADRs

- [ADR-0004 — fetch layer](./docs/decisions/ADR-0004-fetch-layer.md)
- [ADR-0006 — storage](./docs/decisions/ADR-0006-storage.md)
- [ADR-0007 — permissions](./docs/decisions/ADR-0007-permissions.md)
- [ADR-0008 — EPUB pipeline](./docs/decisions/ADR-0008-epub-pipeline.md)

---

## 7. License

Kintsugi is distributed under the GNU General Public License v3.0, inherited
from the original WebToEpub project. See [`LICENSE.md`](./LICENSE.md).
