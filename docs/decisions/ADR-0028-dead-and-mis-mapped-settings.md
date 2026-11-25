# ADR-0028 — Remove the settings that did nothing, and rename the one that did the wrong thing

- **Status:** Accepted
- **Date:** 2025-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0022](./ADR-0022-settings-enforcement.md)

## Context

The first release of the rewrite had a settings page with twenty-three
controls in six groups. Four of them were not connected to anything.

The settings store is deliberately strict: every value is validated against a
schema when it is read, and a value that does not match the schema is
discarded and the default used. That is the right behaviour for a value the
user can set. It is the wrong behaviour for a value the user _cannot_ set,
because the switch in the options page and the value in the store are two
different things, and only one of them does anything.

The four were not all the same kind of wrong:

| Setting                  | What the label promised                          | What the code did                                                                                        |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `images.compress`        | Compress the images                              | Nothing. There is no encoder.                                                                            |
| `images.maxResolution`   | Cap the images at a given size                   | Nothing. The value was passed to the download manager and never used.                                    |
| `privacy.sendStoryUrl`   | Send the story's URL with the metadata lookup    | Nothing. There is no metadata lookup.                                                                    |
| `privacy.metadataLookup` | Check the book's title against a public database | Turned on the legacy flag `noContentToError403`, which is to do with treating an empty page as an error. |

The fourth is the worst of the four, because it was not merely inert: it was
_mapped_. `privacy.metadataLookup` was wired to
`preferences.noContentToError403`, so a user who turned on "look up book
metadata" got a change in how empty pages were treated — and nothing else. The
label described a network request to a third party that the extension has never
made and will not make.

The baseline had a `main.findnovelupdatesurl` that searched novelupdates.com
for a book. The rewrite's inventory kept that feature (F73) "with an explicit
privacy note". It was never built, and the setting that claimed to control it
was pointed at something else.

## Decision

We will **remove** the three settings that did nothing, and **rename** the
fourth to the name of the behaviour it actually controls.

- `images.compress` and `images.maxResolution` are removed. A setting the
  extension cannot honour is a lie; a user who sets "compress the images" and
  gets the same bytes is worse off than a user who knows the feature is not
  there.
- `privacy.sendStoryUrl` is removed. It only ever made sense as part of a
  metadata lookup, and there is no metadata lookup.
- `privacy.metadataLookup` becomes `behaviour.emptyPageIsError`, in the
  behaviour group, with a label that says what it does: when a page comes back
  with no content, report it as a failure rather than writing an empty chapter.
  The legacy flag `noContentToError403` reads the new setting, so the
  behaviour is unchanged — only the name and the label are different. The
  default is still off.
- The `privacy` group goes with them. It held nothing else.

The NovelUpdates lookup (F73) is **not** implemented, and this ADR is where
that deviation is recorded. The reason is the privacy posture the rewrite
takes: `PRIVACY.md` promises that every network request goes to the site the
user is reading, and a metadata lookup would break that promise by sending the
user's reading to a third party. The user who wants the information can open
novelupdates.com themselves; the extension has a parser for it.

The three settings are removed from the schema rather than merely ignored. The
store validates what it reads and drops what is not in the schema, so a
removed key disappears from the stored settings the next time they are
written. A setting that is ignored but still stored would be exported again by
the settings export, and would come back on an import.

## Consequences

### Positive

- Every switch in the options page now does what its label says.
- The settings a user exports are the settings the extension honours.
- The store's schema is the list of things the extension can do, and there is
  nothing in it that is only decoration.

### Negative

- The settings store's shape changed. A stored `privacy` group and a stored
  `images.compress` are dropped on the next write. The default for the
  setting that was renamed is unchanged, so no user sees a behaviour change.
- The NovelUpdates lookup is not available. It is a deliberate trade: a
  privacy promise the extension can keep is worth more than a convenience that
  costs the promise.

### Neutral

- The legacy parsers are unaffected: `noContentToError403` still reads a
  setting, and the setting it reads still has the same default.
