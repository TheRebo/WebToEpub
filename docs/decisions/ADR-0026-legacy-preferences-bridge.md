# ADR-0026 — Bridge the legacy parsers' preferences to the new settings

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0002](./ADR-0002-parser-contract.md), [ADR-0022](./ADR-0022-settings-enforcement.md), [ADR-0028](./ADR-0028-dead-and-mis-mapped-settings.md)

## Context

Kintsugi supports 437 sites. Almost all of them are _migrated_ parsers: the
original extension's parser files, moved into the rewrite's tree unchanged and
wrapped in a compatibility layer. They were written against the original
extension's `UserPreferences` — a bag of `{ value }` boxes that the parser
read directly:

```javascript
if (userPreferences.removeAuthorNotes.value) {
    /* … */
}
```

The rewrite stores its settings in a typed, validated store with a different
shape: `settings.story.removeAuthorNotes` is a boolean, not a box.

The two shapes have to meet somewhere. The audit found that they had not: the
bridge existed in name but the migrated parsers were running with the
_defaults_, whatever the user had configured. The settings were stored,
validated, and shown in the options page — and then quietly did nothing. The
author notes were never removed. The information page was never added. The
highest-resolution image was never used.

## Decision

We will keep the legacy `UserPreferences` shape as the parsers' interface, and
translate the rewrite's settings into it in one place.

- `toLegacyUserPreferences` is the only function that translates. It lives in
  `src/core/parsers/compat/legacy-preferences.ts` and produces a fresh
  preference object for each run, so one run's preferences can never leak into
  the next.
- The translation is explicit and one-to-one. Every legacy preference the
  parsers read is listed, with the new setting it comes from, and the two
  legacy names the rewrite renamed are kept in step.
- One legacy preference is deliberately _not_ translated: the rewrite's
  `minimumDelay` is a floor, not an override. The legacy `overrideMinimumDelay`
  meant "replace the parser's own politeness budget with mine", which is a
  different thing and would let the extension hammer a site that asked for a
  longer pause.
- A failure to read the settings is not a reason to fail a download. The
  defaults are used instead.

## Alternatives considered

| Option                                                  | Why it was rejected                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Rewrite all 437 parsers to the new shape                | Every migrated parser would have to be re-verified against its site. The parser contract exists to make that unnecessary; see ADR-0002. |
| Drop the migrated parsers and write new ones            | That is a rewrite of 437 sites' worth of knowledge, and the sites would break the moment the extension stopped shipping.                |
| Let the parsers read the new settings directly          | The parsers are not ours to change, and the two shapes would drift apart with every future change to either.                            |
| Translate the settings once, at startup, and cache them | The settings can change while a download is running. A cached translation would apply the old value.                                    |

## Consequences

### Positive

- A setting the user changes now reaches the parsers that honour it.
- The parsers stay byte-for-byte the ones that worked, so a site's behaviour
  does not change because the extension was rewritten.
- The translation is in one place, so a new setting is either translated or
  deliberately not, and the file says which.

### Negative

- The rewrite carries a shape it does not otherwise want. Every new setting
  that a legacy parser honours needs a line in the bridge, and the bridge is a
  place where a new setting can be forgotten.
- Two legacy preferences have no equivalent in the new settings —
  `overrideMinimumDelay` and the parser's own minimum delay — and stay
  untranslated on purpose. A reader who goes looking for them in the options
  page will not find them.

### Neutral

- The default parser — the one used for a site with no migrated parser — does
  not read the legacy preferences at all. It has its own implementation of the
  behaviours, and it is not covered by this bridge.
