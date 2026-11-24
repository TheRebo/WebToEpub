# ADR-0013 — Drive the end-to-end tests through Firefox's own Marionette protocol

- **Status:** Accepted
- **Date:** 2025-11-24
- **Relates to:** [ADR-0009](ADR-0009-testing.md), [ADR-0003](ADR-0003-design-system.md)

---

## Context

[ADR-0009](ADR-0009-testing.md) decided that the end-to-end tier would load the
built extension into Firefox and drive the real UI, with accessibility
assertions run against every surface.

The first implementation of that tier used **Playwright** with
`@axe-core/playwright`. It worked well in principle and produced a passing
local run, but it had three problems that only showed up when the tier was
wired into CI:

1. **Playwright does not support loading a Firefox extension.** It can attach
   to a running Firefox, but it cannot install a temporary add-on into it. The
   extension had to be sideloaded by hand into a Playwright profile, and the
   `moz-extension://` URL of a page was then unknowable — it depends on a UUID
   Firefox assigns at install time.

2. **The extension's UUID had to be pinned in the profile's preferences.**
   Firefox assigns a random UUID to each installed add-on. Without a pinned
   one, the test cannot know which `moz-extension://` URL to open, and cannot
   navigate to it at all — Firefox refuses to navigate a page to a privileged
   URL from outside the browser's chrome scope.

3. **`@axe-core/playwright` is a second browser automation stack** layered on
   top of the first. It brought its own context model, its own waiting
   semantics, and its own version skew with Playwright, for the sake of one
   assertion library.

Meanwhile, the accessibility checks that the tier actually needed were not
axe-specific. They were checks of the extension's own accessibility contract:
every interactive control has an accessible name, a focused control shows a
visible focus ring, and the reduced-motion preference is honoured. Those are
checks about _this_ product, and they can be written against the DOM directly.

Firefox ships **Marionette**: its own WebDriver-compatible remote control
protocol, always present, no download required. It can install a temporary
add-on (`Addon:Install`), and a pinned
`extensions.webextensions.uuids` preference makes the extension's URL
predictable before the browser starts.

## Decision

We drive the end-to-end tier through **Marionette**, using a small
hand-written client (`tools/marionette.mjs`), and we express the accessibility
contract as **direct DOM assertions** rather than through axe-core.

Specifically:

- The harness launches a real Firefox with `--marionette`, installs `dist/` as
  a temporary add-on, and talks the Marionette protocol over a TCP socket.
- The extension's internal UUID is pinned in the test profile's preferences,
  so `moz-extension://<uuid>/popup.html` is known before the browser starts.
  This is the mechanism that makes extension pages reachable at all.
- A local fixture server (`tools/e2e-fixture.mjs`) serves a synthetic novel
  site, so the tests never touch the public internet.
- The accessibility checks assert the extension's own contract: an accessible
  name on every control, a visible focus ring on the focused control, and
  reduced-motion honoured. They are written against the DOM.
- **Firefox is not downloaded.** The harness uses whichever Firefox is on the
  machine, and `KINTSUGI_FIREFOX` overrides the choice.

## Alternatives considered

| Alternative                                  | Why rejected                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stay on Playwright**                       | It cannot install a Firefox extension. The whole tier depends on testing the artefact a user actually installs, so this was disqualifying.                                               |
| **Playwright + a hand-sideloaded extension** | Works, but the `moz-extension://` URL is still unknowable without pinning the UUID in the profile's preferences — the same mechanism Marionette uses, with Playwright's overhead on top. |
| **Keep axe-core, drive it with Marionette**  | axe-core is a DOM-level library; it needs a page to run in, not a driver. Injecting it into every page through Marionette buys little over asserting the contract directly.              |
| **Use Selenium WebDriver with geckodriver**  | A third process to install, version-match, and keep alive. Marionette is already inside Firefox and speaks a compatible protocol.                                                        |
| **Test the UI in happy-dom only**            | Cannot exercise the real extension: no `browser.*` APIs, no content script, no background worker. It would have missed every defect found in visual QA.                                  |

## Consequences

### Positive

- The end-to-end tier tests **the artefact a user installs**: the same
  `dist/`, the same manifest, the same content script, the same worker.
- No browser download. CI needs only a Firefox, which the runner image
  already has.
- One automation stack instead of two. The dependency surface shrinks from
  Playwright plus axe to a hand-written protocol client.
- The accessibility checks assert **this product's** contract rather than a
  generic rule set, so a failure points at a specific promise being broken.
- The harness is small enough to read: it is one file, and it is plain
  JavaScript.

### Negative

- Marionette is a Firefox-specific protocol. The tier cannot be pointed at
  Chromium without a second client. Given that the brief scopes the revamp
  to Firefox, this is an acceptable trade.
- The Marionette command set is smaller than Playwright's. Three gaps had to
  be worked around, each documented at the call site:
    - `WebDriver:SendKeys` does not exist; key presses use `WebDriver:PerformActions`.
    - `WebDriver:ExecuteAsyncScript` returns its value double-wrapped, in a
      `{ value: { value: … } }` envelope.
    - `WebDriver:ExecuteScript` does not allow top-level `await`.
- Firefox reports an unexpected dialog as a command failure **even after it
  has dismissed the dialog itself**. The client treats that specific failure
  as the interruption it is.
- Stock Firefox refuses to navigate to a `moz-extension://` URL from outside
  the chrome scope. The Playwright build of Firefox is permitted to; the
  harness prefers it when it is present, and falls back to stock Firefox.

### Neutral

- The extension's UUID is pinned in the test profile. This is a test-only
  setting and never reaches a shipped profile.
- The fixture site remains the same shape it was under Playwright: a
  paginated table of contents, a chapter per path, and a cover image.
