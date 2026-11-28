# ADR-0020 — The first run explains itself

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0003](./ADR-0003-design-system.md), [ADR-0007](./ADR-0007-permissions.md)

## Context

The extension has one job that a newcomer cannot guess: it needs the address
of a page that holds a chapter list, and it needs permission to read that
site before it can do anything at all.

Both facts are invisible until they are needed. A user who installs the
extension and clicks the toolbar button sees a popup with an empty field in it
and no indication of what to type. A user who types a URL they know is a
chapter list sees a permission prompt for a site they did not choose to grant
anything to, with no explanation of what happens next.

The original had neither. Its popup was a wall of checkboxes, and its first
action was to fetch a URL the extension had no permission to fetch.

## Decision

We will make the first run part of the product, not an afterthought.

- The popup asks the one question it needs answered, in the user's language:
  which story? The field is empty, labelled, and focused.
- When the user has not been through the welcome before, the popup opens the
  onboarding page instead of the workbench. The onboarding is a short set of
  screens that says what the extension does, shows a picture of a finished
  book, and ends on the workbench itself — so the user's first click after
  reading is a real click on a real page.
- The onboarding is shown **once**. A flag in the settings records that it
  has been seen; the user can reopen it from the options page at any time.
- Nothing in the onboarding asks for a permission. The permission is asked
  for later, at the moment the user names a site, and it is asked for from a
  real click on the site the user named — never from the background worker.
  See [ADR-0030](./ADR-0030-host-access-one-site-at-a-time.md).

## Alternatives considered

| Option                            | Why it was rejected                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| No onboarding; show the workbench | The workbench cannot say what it wants. The user is asked for a URL before they know what a URL means to this extension.          |
| A modal that greets the user      | A modal interrupts; a page can be read, re-read and linked to.                                                                    |
| Show the onboarding every time    | A greeting that repeats is noise. The user has been told once, and the flag remembers.                                            |
| Ask for `<all_urls>` up front     | The broadest permission, asked for before the user has any idea what they are getting. See [ADR-0007](./ADR-0007-permissions.md). |
| A slideshow of every feature      | A tour is a way of hiding the product. The product is one field and one button; the onboarding says that and stops.               |

## Consequences

### Positive

- A newcomer reaches a working first book without reading any documentation.
- The extension asks for nothing before it has been used, which is what makes
  the later permission request feel proportionate.
- The onboarding is a real page, so it can be translated, styled with the
  design system, and opened again later.

### Negative

- The first run costs the user a page they did not ask for. It is short, and
  it ends on the workbench, so the cost is small — but it is a cost.
- The onboarding has to be maintained: if the product's shape changes, the
  pictures in it change too.

### Neutral

- The "have I seen this" flag lives in the settings, alongside the other
  preferences, and is exported with them.
