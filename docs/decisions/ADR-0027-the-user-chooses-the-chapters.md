# ADR-0027 — The user chooses the chapters

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0003](./ADR-0003-design-system.md), [ADR-0006](./ADR-0006-storage.md)

## Context

A story site lists its chapters in one of two ways. Either the list is the
story — every chapter, in order, from the first to the last — or the list is
the whole archive: a hundred volumes, a side story, a "chapter 0" prologue, a
preview, an author's note from four volumes ago.

The extension cannot tell them apart. A parser that trusts the list will
happily build a book that contains a prologue, a "previously on", an
interlude and an epilogue, and the user gets a book with material they did
not ask for in it.

The original left the user with a list of checkboxes. That is the right
mechanism — the extension knows less about the story than the user does — but
a list of two hundred checkboxes is a wall, and unchecking seventy of them by
hand is a chore nobody will do.

## Decision

We will give the user a range, as well as a list.

- The chapter list is a list of checkboxes, each one telling the user what
  the chapter is. Every chapter starts checked, and the list is scrollable
  and searchable.
- A **range** control narrows the selection to a contiguous run of chapters:
  the user types a first and a last chapter number, and the chapters in
  between are checked and the ones outside are not.
- The range is validated as it is typed: a range that is backwards, or that
  runs past the end of the list, is refused with a message that says what is
  wrong and what the bounds are. The count of what the range covers is shown
  before the user commits to it.
- The range is a starting point, not a decision. After it is applied the
  user can still tick or untick individual chapters.

The range is the common case, and it is one dialog. The list is the escape
hatch, and it is right there.

## Alternatives considered

| Option                                             | Why it was rejected                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The extension decides which chapters are the story | It does not know. A parser that guesses wrong produces a book the user has to throw away.                                                   |
| Checkboxes only                                    | Correct, and tedious: two hundred boxes is a wall, and unchecking seventy of them by hand is a chore nobody will do.                        |
| A "first" and "last" chapter picker                | A picker needs the chapter _titles_, which needs the list to be loaded and rendered — so it is the same list, with more steps.              |
| Presets per site                                   | The presets would have to be written per site, for a list the user is looking at right now, and would be wrong for a story with a side arc. |
| A regular expression over chapter numbers          | Powerful, unfriendly, and it cannot express "everything except the ones with 'prologue' in the title".                                      |
| Remembering the last range                         | The range is different for every story, and a remembered range applied to the wrong story is worse than no range at all.                    |

## Consequences

### Positive

- A book with a hundred volumes is trimmed in two seconds.
- The user keeps the last word: the range is a starting point.
- The count of what a range covers is shown before it is applied, so the
  number is never a surprise.

### Negative

- A range cannot select a non-contiguous set. That is what the checkboxes are
  for, and the two work together.
- The range speaks in chapter _numbers_, not titles, because a title is not
  unique and a number always is.

### Neutral

- The range is a dialog on the workbench, not a separate page. It is a
  short-lived, single-purpose task, and a page for it would be a page to
  navigate back from.
