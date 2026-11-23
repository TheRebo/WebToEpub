# Privacy policy

Version 2.0 · Applies to: **Kintsugi** (the WebToEpub revamp)

**Short version:** Kintsugi does not collect, transmit, sell, or share any
data. Everything stays on your machine. There is no account, no telemetry,
and no server operated by the project.

---

## 1. What Kintsugi collects

**Nothing.**

Kintsugi has no analytics, no crash reporting, no usage telemetry, no
fingerprinting, and no advertising identifier. The extension makes no
requests to any server operated by the project or its maintainers.

The manifest declares this explicitly, and Firefox enforces it:

```json
"data_collection_permissions": { "required": ["none"], "optional": [] }
```

---

## 2. What Kintsugi stores, and where

Everything Kintsugi stores is stored **locally in your browser profile** and
is visible to you in the options page.

| Data                                        | Where it lives                                      | Why                              | How to remove it                        |
| ------------------------------------------- | --------------------------------------------------- | -------------------------------- | --------------------------------------- |
| Settings (theme, accent, density, defaults) | `browser.storage.local`, key `kintsugi.settings`    | Remembered preferences           | Options → Advanced → Reset all settings |
| Saved site access                           | `browser.permissions`                               | Knowing which sites you approved | Options → Site access → Revoke          |
| Custom parsers (CSS selectors you wrote)    | `browser.storage.local`, key `kintsugi.parsers`     | Reuse your selectors             | Options → Site access → Custom parsers  |
| Reading list                                | `browser.storage.local`, key `kintsugi.readingList` | Unpacked stories you saved       | Options → Reading list → Delete         |
| Your library (EPUB files)                   | **IndexedDB**, database `kintsugi-library`          | The books you made               | Options → Library → Delete              |
| In-progress download checkpoints            | `sessionStorage`                                    | Resume a download after a reload | Cleared when the tab closes             |

**None of this is encrypted, and none of it is transmitted.** Firefox's
extension storage is already protected by your operating system's profile
encryption (if you use one) and by your browser's profile isolation.

---

## 3. Network requests Kintsugi makes

Kintsugi fetches pages **only from the site you asked it to read**. The
requests are:

| Request                 | When                            | Destination                         |
| ----------------------- | ------------------------------- | ----------------------------------- |
| Chapter pages           | During a download               | The site you are reading            |
| Table-of-contents pages | While building the chapter list | The site you are reading            |
| Images                  | During a download               | The same site, or a CDN it links to |

These requests carry the ordinary headers a browser sends, including the
cookies that site has already set — because that is what makes a
logged-in page readable. Kintsugi does not copy cookies to anywhere else.

### One optional request, off by default

Kintsugi can look up book metadata (author, cover, description) from a public
metadata service. This is **off by default** and requires two explicit
opt-ins in Options → Privacy:

1. "Look up book metadata" — enables the feature at all.
2. "Send the story URL to the metadata service" — permits the story's URL to
   leave your machine.

If both are off — the default — no request ever leaves the sites you are
reading.

---

## 4. Site access

Kintsugi requests access to a site **only when you choose to use it on that
site**, and it requests only that origin. You can see and revoke every grant
in Options → Site access.

Kintsugi never:

- reads a page you are not currently using it on,
- injects UI into the page,
- modifies the page it reads,
- observes your browsing history,
- tracks you across sites.

The content script it injects is a **reader**: it extracts the DOM and sends
it back. It does not modify anything.

---

## 5. Data you create is yours

The EPUB files Kintsugi builds are saved to your downloads folder using your
browser's normal download mechanism. Kintsugi does not keep a copy anywhere
else unless you explicitly add it to your library.

---

## 6. Cookies

For a subset of protected sites, Kintsugi copies a site's existing cookies
into an unpartitioned cookie so that a request from the extension's context
is authenticated the same way your tab is. Those cookies:

- are only ever read for the **registrable domain of the URL being fetched**,
- are only ever sent back to the origin they came from,
- are **always removed afterwards**, including when the request fails.

Kintsugi never inspects, stores, or transmits the contents of your cookies.

---

## 7. Children

Kintsugi is not directed at children and collects no personal information
from anyone.

---

## 8. Changes to this policy

Any change to this policy will be published in this file and in
[`CHANGELOG.md`](./CHANGELOG.md). Because the answer is "nothing is
collected", a change that would make this document longer would be a
regression, and would need to be justified in an ADR.

---

## 9. Contact

Questions about privacy can be raised as an issue on the project's tracker,
or privately through the project's security contact described in
[`SECURITY.md`](SECURITY.md).

---

## 10. Related documents

- [Permissions rationale](./docs/permissions.md)
- [Security policy](./SECURITY.md)
- [ADR-0006 — storage](./docs/decisions/ADR-0006-storage.md)
- [ADR-0007 — permissions](./docs/decisions/ADR-0007-permissions.md)
