# ADR-0048 — A parser's method is not hidden by a field, and it cleans before the sanitiser

- **Status:** Accepted
- **Date:** 2026-11-28
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0026](./ADR-0026-legacy-preferences-bridge.md), [ADR-0047](./ADR-0047-the-defaults-a-new-user-gets.md)

## Context

A Novel Phoenix book, with the information page on (ADR-0047), had no
description. Three faults in the compat layer were behind it:

1. **A declared field hid the parser's method.** `LegacyParser` declared
   `getInformationEpubItemChildNodes?: …` and
   `findParentNodeOfChapterLinkToRemoveAt?: …` as optional properties. The
   build targets ES2022, where a class field is a real property: every
   instance got its own `undefined`, which hides the method a migrated
   parser defines on its prototype. Checked across all 465 legacy parser
   classes: 296 lost their information page and description, and 49 lost
   the clean-up of the elements around a next or previous chapter link.
2. **The parser cleaned the sanitised copy.** `populateInfoDiv` sanitised a
   node and then called the parser's `cleanInformationNode` on the result,
   as the original did. The original's sanitiser kept classes and `<nav>`;
   the rewrite's drops every class and unwraps `<nav>` and `<section>`. A
   parser's "remove `nav.links`" removed nothing.
3. **The description was `textContent`.** Paragraphs ran together ("…the
   end.The next…") and the page's indentation came along.

The information page's nodes were also fetched with the method detached from
the parser, so a method that read `this` threw.

## Decision

1. The two optional methods are `declare`d. TypeScript knows their type; no
   field is emitted.
2. The parser cleans a copy of the page's own markup, and the copy is
   sanitised afterwards. The copy is detached and came from `DOMParser`, so
   nothing in it runs.
3. The description is the information nodes' text with one line per block
   (`blockText`). The information page shows each line as a paragraph.
4. `getInformationEpubItemChildNodes` is called on the parser.

## Alternatives considered

| Option                                         | Why it was rejected                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Set `useDefineForClassFields: false`           | It changes every class in the project to fix two lines.                      |
| Let the sanitiser keep `class`                 | Classes are dropped on purpose; the chapters do not need the site's styling. |
| Keep the original order (sanitise, then clean) | The parser's selectors cannot match what the sanitiser leaves.               |

## Consequences

### Positive

- 296 parsers have a description and an information page again.
- 49 parsers remove the wrapper of a next or previous chapter link again.
- A parser's clean-up of the information page works.

### Negative

- A parser whose information nodes are not a synopsis (Novel Phoenix's
  include the rank and the view count) now shows that text, as the original
  extension did. The parser's selector is the fix, on the `legacy` branch.

### Neutral

- A test checks that no base-class property hides either method.
