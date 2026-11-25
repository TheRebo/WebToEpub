# ADR-0022 — Enforce the settings in one place

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0008](./ADR-0008-epub-pipeline.md), [ADR-0028](./ADR-0028-dead-and-mis-mapped-settings.md)

## Context

Kintsugi has around thirty settings. Each one is read by exactly one part of
the extension — the appearance settings by the theme controller, the story
settings by the workbench, the EPUB settings by the packer, and so on.

The baseline read the settings wherever it needed them, straight from
`chrome.storage.local`, with no validation and no single place that knew what
the settings were supposed to mean. That produced three classes of bug:

- A setting that was stored under the wrong name was silently ignored. The
  user changed it, the UI showed the new value, and the behaviour never
  changed.
- A setting that was stored with a _part_ of its group — `{"appearance":
{"theme": "dark"}}` — replaced the whole group, so every other setting in
  that group reverted to its default.
- A setting that was written by one part of the extension and read by another
  could disagree about the type, and the disagreement showed up as a wrong
  value rather than as an error.

## Decision

We will read the settings through a single typed store, `SettingsStore`, and
enforce them there.

- The store owns the shape. `DEFAULT_SETTINGS` is the one definition of what a
  complete set of settings looks like, and `Settings` is the one type that
  describes it.
- The store merges a partial update over the _stored_ value, group by group,
  rather than over the whole object. A write of `{"appearance": {"theme":
"dark"}}` changes the theme and leaves the accent, the density and the
  reduce-motion preference alone.
- The store validates on write. A value of the wrong type is rejected rather
  than stored, and the previous value is kept.
- Nothing else in the extension reads `browser.storage.local` for settings
  directly. The `SettingsStore` is the only thing that knows how settings are
  stored.

## Alternatives considered

| Option                                                        | Why it was rejected                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep reading the settings directly, but validate at each site | The validation would be duplicated at every site, and the group-merge bug would be fixed in one place and reintroduced in another.               |
| Store each setting under its own key                          | A setting that belongs to a group would need several keys, and a group could be left half-written.                                               |
| Keep the settings in `localStorage`                           | `browser.storage.local` is the extension's own store, is not cleared with the site's, and can be synchronised and inspected by the options page. |

## Consequences

### Positive

- A setting that is stored is a setting that is read. The dead settings found
  during the audit were dead because nothing enforced the link between the
  two, and that class of bug is now impossible to introduce.
- A partially written group no longer resets its siblings.
- The settings can be exported and imported as one document, which the
  options page needs.

### Negative

- Every part of the extension that reads a setting now goes through an
  asynchronous call. The options page and the workbench already awaited their
  reads, so this cost nothing in practice, but it does mean a new caller
  cannot read a setting synchronously.
- The store has to be given a copy of the defaults rather than the defaults
  themselves. `DEFAULT_SETTINGS` is a shared object, and mutating it in one
  place would change it everywhere.

### Neutral

- The store's validation is deliberately shallow. It checks the shape and the
  type of a value, not whether it makes sense. Deciding that a language code
  is nonsense is the user's business, not the store's.
