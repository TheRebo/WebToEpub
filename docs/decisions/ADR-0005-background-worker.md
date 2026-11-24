# ADR-0005 — Move the download into a background service worker

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0004](ADR-0004-fetch-layer.md)

---

## Context

The baseline has **no background worker**. Every byte of work — fetching
chapters, downloading images, assembling the ZIP, writing to storage,
triggering the download — happens inside the extension _page_.

This single fact drives most of the baseline's UX problems:

1. **The popup cannot be the tool.** The browser destroys a popup when it
   loses focus. A 30-minute download would be killed the moment the user
   clicked away. So `main.isOpenInBrowserTab()` detects that the popup is a
   popup, opens the _same page_ in a new tab, and closes the popup
   (`main.js:389-402`). The user clicks the toolbar icon and sees the popup
   flash and vanish before a tab appears — and the whole UI then lives at
   `chrome-extension://…/popup.html?id=132`, an internal URL with a visible
   query string and no document title.

2. **Cancel is unsafe.** The page's `beforeunload` handler (`main.js:566-573`)
   fires a native browser confirm to give the user a chance to cancel closing
   the tab. This is the only thing preventing a lost download, and it is a
   crude substitute for a real background job.

3. **The UI can wedge.** `fetchContentAndPackEpub` sets
   `window.workInProgress = true` and disables the Pack button _before_
   `await parser.fetchContent()`, with no `try/finally` around it. Any throw
   leaves the flag set and the button disabled — and the `beforeunload`
   guard then refuses to let the user close the tab. The UI is effectively
   locked.

4. **Progress is invisible.** The work is in the page, so the page must be
   open and focused for the user to see the progress bar.

## Decision

We introduce a **Manifest V3 background service worker** that owns the
download pipeline, and make the page a pure client of it.

### Ownership

| Concern                        | Owner                                       |
| ------------------------------ | ------------------------------------------- |
| Fetching chapters              | **Background worker**                       |
| Downloading images             | **Background worker**                       |
| Assembling the EPUB            | **Background worker**                       |
| Saving the file                | **Background worker**                       |
| Persisting to the library      | **Background worker**                       |
| Rendering UI, editing metadata | Page                                        |
| Progress reporting             | Background → page via `runtime.sendMessage` |

### Long-running work and MV3's service-worker lifetime

MV3 service workers are terminated after ~30 s of inactivity. A 30-minute
download cannot rely on the worker staying alive. Two mechanisms keep it
alive:

1. **The worker is kept alive by activity.** Every fetch resolves within the
   worker's event lifetime; the worker schedules the next fetch in the
   `onResponse` handler rather than `await`ing a long timer. In practice,
   Firefox keeps a worker alive while it has pending extension API calls and
   an open message port.
2. **A port is held open.** The page opens a `runtime.connect` port for the
   duration of the operation. An open port keeps the worker alive in both
   Firefox and Chrome.

If the worker is nonetheless terminated (browser restart, extension reload),
the operation is **resumable**: progress is checkpointed to `sessionStorage`
after each chapter, so a re-opened workbench can offer "Resume the download
of _The Wandering Inn_ (42/318)".

### Protocol

```ts
// Page → worker
type Request =
    | { type: "start"; story: StoryDescriptor }
    | { type: "cancel" }
    | { type: "resume" };

// Worker → page
type Event =
    | {
          type: "progress";
          phase: Phase;
          done: number;
          total: number;
          label: string;
      }
    | { type: "chapter-state"; sourceUrl: string; state: ChapterState }
    | { type: "done"; fileName: string; bytes: number; location?: string }
    | { type: "error"; error: UserFacingError };
```

Every message is a **discriminated union with a literal `type`**, validated at
the boundary by a hand-written type guard. There is no `any` on the message
path.

### The workbench is a tab, and stays one

With the work in the worker, the page no longer needs to survive the
operation. The workbench remains a tab (it is a big, multi-column workspace
that a 320×600 popup cannot host), but:

- closing the tab **does not abort** the download,
- the toolbar popup shows live progress and a Cancel button,
- re-opening the workbench re-attaches to a running operation and shows its
  progress.

This is the concrete fix for the original's "the popup flashes and closes"
behaviour: the popup now stays a popup, and the workbench opens in a tab
**directly** from the action, with no intermediate flash.

## Alternatives considered

| Alternative                                                       | Why rejected                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep everything in the page**                                   | This is the baseline. It is the root cause of the popup/tab dance, the unsafe cancel, and the wedge bug.                                                                                                                |
| **Use an MV2 background page**                                    | Firefox still supports MV2, but MV2 is deprecated, Chrome has removed it, and MV3's service worker is the direction. MV2 also gives a long-lived background page, which is exactly what we are trying not to depend on. |
| **Use `offscreen` documents for the ZIP assembly**                | `offscreen` exists for DOM-dependent work. ZIP assembly does not need a DOM — `zip.js` runs fine in a worker. Unnecessary complexity.                                                                                   |
| **Keep the popup as the whole UI and make it survive focus loss** | A popup is capped at roughly 800×600 in Firefox and cannot be resized by the user. The chapter list of a 3 000-chapter novel and the options surface both need more room.                                               |
| **Do not checkpoint; require the tab to stay open**               | Simpler, but a browser crash loses a 30-minute download. Checkpointing is a few lines given the chapter list is already in memory.                                                                                      |

## Consequences

**Positive**

- The download survives the tab being closed or the popup being dismissed.
- Cancel is real and safe — no `beforeunload` confirm needed.
- The popup can be a small launcher that shows progress, which is what a
  popup is good at.
- Progress can be surfaced in the toolbar badge (`action.setBadgeText`).
- The UI can no longer wedge, because the work is not in the page's call
  stack.

**Negative**

- The background worker has a **30-second idle-termination budget** in MV3,
  which we must actively manage. The port-based keep-alive and the
  checkpointing are the mitigation.
- The cross-context message protocol is a new surface that must be typed,
  validated, and tested. It is a real cost — but it is also the same cost
  the baseline paid with `runtime.sendMessage` for the DOM, except that
  ours is typed and validated.
- Firefox support for `service_worker` in MV3 is present but newer than the
  rest of MV3; the manifest declares `strict_min_version` accordingly.

**Neutral**

- The extension remains Firefox-first, as the brief requires.
