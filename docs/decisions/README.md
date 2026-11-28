# Architecture Decision Records

Every significant decision in the Kintsugi revamp is recorded here. Each ADR
states the context, the decision, the alternatives considered, and the
consequences — positive _and_ negative.

| ADR                                                                  | Title                                                                        | Status   | Key outcome                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| [0001](./ADR-0001-rewrite-from-scratch.md)                           | Rewrite from scratch in a new source tree                                    | Accepted | New `src/` tree, TypeScript, real build step, legacy preserved on a branch                           |
| [0002](./ADR-0002-parser-contract.md)                                | Preserve the parser contract, add a compat shim                              | Accepted | The 434-parser contract survives verbatim; incremental migration is safe                             |
| [0003](./ADR-0003-design-system.md)                                  | A design-token-driven component library on native Web Components             | Accepted | 3-layer token model; no raw colour can reach a component (lint-enforced)                             |
| [0004](./ADR-0004-fetch-layer.md)                                    | Rewrite the fetch layer around `AbortSignal` and a single retry policy       | Accepted | Cancel really cancels; cookie cleanup in `finally`; the custom-error contract is fixed               |
| [0005](./ADR-0005-background-worker.md)                              | Move the download into a background service worker                           | Accepted | Downloads survive the tab closing; the popup stops flashing and closing                              |
| [0006](./ADR-0006-storage.md)                                        | Typed storage: `browser.storage` for settings, IndexedDB for the library     | Accepted | `unlimitedStorage` dropped; the import race and over-broad clear are impossible                      |
| [0007](./ADR-0007-permissions.md)                                    | Reduce the permission set and make host access optional                      | Accepted | 3 fewer permissions; `webRequest` → scoped DNR; `<all_urls>` → optional                              |
| [0008](./ADR-0008-epub-pipeline.md)                                  | Rebuild the EPUB pipeline on a real EPUB reader/writer                       | Accepted | No regex touches XML; a failed image can never corrupt the EPUB                                      |
| [0009](./ADR-0009-testing.md)                                        | A headless test stack: Vitest + a browser-driven tier                        | Accepted | Tests run in CI; accessibility failures break the build                                              |
| [0010](./ADR-0010-i18n.md)                                           | Internationalisation: one catalogue, five locales, graceful fallback         | Accepted | The `__MSG_` sweep is gone; missing keys fall back to English                                        |
| [0011](./ADR-0011-site-selectors.md)                                 | The default parser: a visible guess, and a way to replace it with an answer  | Accepted | Unknown sites announce the guess and can be taught once                                              |
| [0012](./ADR-0012-lazy-zip.md)                                       | Load the ZIP library on demand, behind a lazy facade                         | Accepted | 155 KB of ZIP code is fetched only by the one parser that needs it                                   |
| [0013](./ADR-0013-marionette-end-to-end-testing.md)                  | Drive the end-to-end tests through Firefox's own Marionette protocol         | Accepted | The tier tests the artefact a user installs, with no browser to download                             |
| [0014](./ADR-0014-dark-theme-token-ramp.md)                          | Reverse the neutral ramp in the dark theme instead of re-declaring it        | Accepted | `--bg` is "the background" in both themes; the dark theme is a first-class design                    |
| [0015](./ADR-0015-epub-container.md)                                 | Build the EPUB container ourselves, and store the `mimetype` entry           | Accepted | Every book carries a valid `mimetype` entry; the archive's bytes are asserted                        |
| [0016](./ADR-0016-package-images.md)                                 | Package the images the book actually references                              | Accepted | A saved book is readable offline; each image is written once                                         |
| [0017](./ADR-0017-zip-without-a-worker.md)                           | Build the ZIP in the worker, without a web worker                            | Accepted | The save always completes; the CSP stays strict                                                      |
| [0018](./ADR-0018-message-boundary.md)                               | Validate every message's payload at the bus                                  | Accepted | A malformed message is answered, not thrown at a handler                                             |
| [0019](./ADR-0019-library-shelf.md)                                  | The library is a shelf, not a note                                           | Accepted | Books are recorded and can be listed and deleted; nothing is kept unseen                             |
| [0020](./ADR-0020-first-run-explains-itself.md)                      | The first run explains itself                                                | Accepted | A newcomer reaches a working book without reading documentation                                      |
| [0021](./ADR-0021-serialised-settings-writes.md)                     | Serialise the settings writes                                                | Accepted | Two settings changed at once both stick; a failed write does not wedge the queue                     |
| [0022](./ADR-0022-settings-enforcement.md)                           | Enforce the settings in one place                                            | Accepted | A stored setting is a read setting; a partial group write cannot reset its siblings                  |
| [0023](./ADR-0023-url-redaction.md)                                  | Redact URLs before they reach a log                                          | Accepted | A signed image URL or a session token can never reach the console                                    |
| [0024](./ADR-0024-check-what-came-back.md)                           | Check that a response is what was asked for                                  | Accepted | An error page is never written into the book as if it were a picture                                 |
| [0025](./ADR-0025-chapters-are-written-as-xml.md)                    | Write chapters as XML, not as HTML                                           | Accepted | A chapter with a `<br>` in it is still a well-formed document                                        |
| [0026](./ADR-0026-legacy-preferences-bridge.md)                      | Bridge the legacy parsers' preferences to the new settings                   | Accepted | The 437 migrated parsers finally see the settings the user configured                                |
| [0027](./ADR-0027-the-user-chooses-the-chapters.md)                  | Give the user a range, as well as a list                                     | Accepted | A hundred-volume story is trimmed in two seconds; the user keeps the last word                       |
| [0028](./ADR-0028-dead-and-mis-mapped-settings.md)                   | Remove the settings that did nothing, and rename the one that misled         | Accepted | Three dead settings gone; one setting renamed to what it actually does                               |
| [0029](./ADR-0029-diagnostics-logger.md)                             | A diagnostics logger that is off by default                                  | Accepted | The developer switch works; no telemetry; no console output in a normal install                      |
| [0030](./ADR-0030-host-access-one-site-at-a-time.md)                 | Ask for host access one site at a time, from the page                        | Accepted | The extension ships with no host permissions; the prompt appears when it is answered                 |
| [0031](./ADR-0031-epub-specification-conformance.md)                 | Conform to the EPUB specification, and check it with the reference validator | Accepted | Both EPUB versions validate with zero errors and zero warnings                                       |
| [0032](./ADR-0032-what-the-extension-may-fetch.md)                   | Decide what the extension may fetch, in one place                            | Accepted | A page cannot use the extension to reach the user's own network                                      |
| [0033](./ADR-0033-read-the-page-the-user-is-looking-at.md)           | Read the page the user is looking at, and fall back to fetching it           | Accepted | Sites that build their chapter list in the browser work, without a parser each                       |
| [0034](./ADR-0034-library-import.md)                                 | Let the library be carried over from the original extension                  | Accepted | A library exported from the original extension opens in the new one                                  |
| [0035](./ADR-0035-bounded-imports.md)                                | An import is bounded, and the limit is the reader's business                 | Accepted | A zip bomb is refused, and the user is told why                                                      |
| [0036](./ADR-0036-granted-by-name.md)                                | "The extension may read this" is not "the user allowed this host"            | Accepted | The private-host guard works again, whatever grants the extension holds                              |
| [0037](./ADR-0037-the-bytes-decide.md)                               | The bytes decide what an image is                                            | Accepted | Every image has a media type the reader understands and a matching file name                         |
| [0038](./ADR-0038-xml-forbidden-characters.md)                       | The characters XML forbids never reach the book                              | Accepted | One control character no longer costs the reader the whole book                                      |
| [0039](./ADR-0039-the-page-the-image-belonged-to.md)                 | A relative image belongs to the page it was served from                      | Accepted | A redirected chapter's images are fetched from the right address                                     |
| [0040](./ADR-0040-the-selectors-belong-to-the-story.md)              | The saved selectors belong to the story, not to the first chapter            | Accepted | The user's own selectors are found on sites that serve their chapters elsewhere                      |
| [0041](./ADR-0041-an-empty-chapter-is-a-failure.md)                  | A chapter with nothing in it is a failure, not a chapter                     | Accepted | A book never holds a blank chapter where the story should be                                         |
| [0042](./ADR-0042-the-page-names-its-own-cover.md)                   | The page's own word about its cover comes first                              | Accepted | A book's cover is the picture the site chose, not the first picture on the page                      |
| [0043](./ADR-0043-a-blocked-database-is-a-wait.md)                   | A blocked database is a wait, not a failure                                  | Accepted | Two tabs of the extension no longer break each other's library                                       |
| [0044](./ADR-0044-a-namespace-declaration-is-part-of-the-element.md) | A namespace declaration is part of the element                               | Accepted | The public serialiser cannot produce a document that is not well-formed XML                          |
| [0045](./ADR-0045-the-browser-follows-redirects.md)                  | The browser follows redirects, and a rule keeps them public                  | Accepted | Redirected chapters load, and a redirect into the user's network is blocked before it is sent        |
| [0046](./ADR-0046-the-book-opens-on-its-cover.md)                    | The book opens on its cover, and the author is named once                    | Accepted | Every reader shows the cover, and chapters start with their heading                                  |
| [0047](./ADR-0047-the-defaults-a-new-user-gets.md)                   | The defaults a new user gets                                                 | Accepted | Failed chapters are visible, books carry their synopsis and source, and defaults have one definition |

---

## ADR lifecycle

- **Proposed** → under discussion, not yet binding.
- **Accepted** → in force. Deviating from it requires a new ADR that
  supersedes this one.
- **Superseded by ADR-NNNN** → kept for history, with a pointer.
- **Deprecated** → no longer relevant, kept for history.

An ADR is **never deleted**. If a decision is reversed, the reversal is a new
ADR.

## Template

```markdown
# ADR-NNNN — <Title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** <who>
- **Relates to:** <links>

## Context

<What forces are at play? What constraints apply? What does the reader need
to know to understand the decision?>

## Decision

<What was decided, stated in the active voice: "We will …">

## Alternatives considered

<A table of the options and why each was rejected.>

## Consequences

### Positive

### Negative

### Neutral
```
