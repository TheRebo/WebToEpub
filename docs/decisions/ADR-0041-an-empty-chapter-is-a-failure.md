# ADR-0041 — A chapter with nothing in it is a failure, not a chapter

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0005](./ADR-0005-background-worker.md), [ADR-0008](./ADR-0008-epub-pipeline.md)

## Context

A chapter's page can be served successfully and still carry nothing. The
site answers with a shell whose content is filled in by a script the
extension did not run; a session has not settled yet; a paywall returns a
blank page.

The download manager noticed this — it fetched such a page a second time,
because an empty answer is usually temporary. But it only used the emptiness
to decide _whether to try again_. It never asked, afterwards, whether the
second answer had any prose in it.

So an empty chapter was packed into the book as though it were a real one.
The reader found a blank page where the story should be. The progress
reported the chapter as loaded, and the job as complete, with no failure
counted.

The original treated this as an error: `isNoContentToError403AndContentNull`
turned a page with no content into a 403, which put the chapter into the
failed state. The rewrite lost that.

## Decision

A chapter whose content holds nothing a reader would see is a failure.

The check is made after the content has been extracted and cleaned up, so it
sees what the book would actually contain. A chapter with no words but with a
picture is still a chapter — the reader shows the picture, and nothing is
wrong with it — so the check looks for an image, a video or an audio element
as well as for text.

A failed chapter is then handled the way every other failure is handled: it
is counted as failed, and it is either left out of the book or kept as a
placeholder, depending on the user's setting.

## Alternatives considered

| Option                                                                       | Why it was rejected                                                                                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pack it as an empty chapter                                                  | The bug. The book claims to hold a chapter it does not hold, and the reader is the only one who finds out.                                          |
| Treat every page with no text as a failure, including one with only an image | A chapter that is only an illustration is a real chapter. Failing it would lose a chapter that arrived perfectly well.                              |
| Fail only when the whole _document_ is empty                                 | The document may have plenty of text — a navigation bar, a comment form — while the content element is empty. The check has to look at the content. |
| Warn the user but keep the chapter                                           | A warning the user cannot act on is noise. The chapter either has content or it does not.                                                           |

## Consequences

### Positive

- A book never holds a blank chapter where the story should be.
- The failure count is honest: the chapters that did not arrive are counted
  as failures, so the workbench's progress says what actually happened.
- The original's behaviour is restored.

### Negative

- A site that serves its chapters as a script-driven shell, which the
  extension cannot run, now produces failures where it used to produce blank
  chapters. The failures are visible, which is the point: the user can see
  that the site needs a parser, and the workbench's site-selector panel is
  the answer.
- A chapter made only of an element the check does not know about — a
  canvas, say — would be failed. The check covers the elements a reader
  actually shows.

### Neutral

- The check is one function call per chapter.
