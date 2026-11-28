# ADR-0021 — Settings are written one at a time, in order

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0006](./ADR-0006-storage.md), [ADR-0022](./ADR-0022-settings-enforcement.md)

## Context

The options page writes settings. The workbench writes settings. The
background worker reads them and caches them. All three run at the same time,
in different contexts, over one key in `browser.storage.local`.

Storage in an extension is not a database. `browser.storage.local.set` writes
the whole value under a key; it does not merge, it does not queue, and it does
not wait for the write before the next one starts. Two writes that overlap
therefore resolve in whatever order the browser happens to schedule them, and
the second one — which was built from the first one's _stale_ copy of the
settings — overwrites the first one's change.

The result is a setting that silently reverts to the old value. The user
changes two things in the options page, closes the tab, comes back, and one
of them has vanished with no error anywhere.

The original had the same race, with a wider blast radius: it wrote several
keys at once, and a half-finished write left the extension with some settings
from the old version and some from the new.

## Decision

We will serialise every write to the settings, and we will make each write see
the result of the one before it.

- The store owns a single promise chain. Every write is appended to it and
  runs after everything already queued.
- The read-modify-write of a single setting happens **inside** that queue, so
  two overlapping changes to different settings cannot overwrite each other.
  Two changes to the _same_ setting resolve in the order the user made them,
  which is the order they were queued in.
- A write that fails does not break the chain: the queue is advanced past it,
  and the failure is reported to the caller. A rejected write must not wedge
  every later write behind it.
- The cached copy of the settings is invalidated when the value changes in
  storage, so the worker sees the new value without being restarted. See
  [ADR-0022](./ADR-0022-settings-enforcement.md) for how a stored value is
  turned into an enforced one.

## Alternatives considered

| Option                                   | Why it was rejected                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write the whole object every time        | That is the race. Two overlapping writes resolve in the wrong order and one change is lost.                                                               |
| Write one key per setting                | It avoids the _whole-object_ overwrite, but not the lost update: two changes to two keys still race, and the storage quota is spent on many small values. |
| Optimistic locking with a version number | It detects the conflict, but the user still loses the change — and now has to be told about it.                                                           |
| Let the browser serialise it             | `storage.local` makes no ordering promise between overlapping `set` calls. Relying on one would be relying on a race.                                     |
| Retry on mismatch                        | The retry would read the same stale value again unless the whole read-modify-write were repeated, which is the queue.                                     |

## Consequences

### Positive

- Two settings changed at once both stick.
- A failed write is reported rather than swallowed, and does not stop later
  writes from happening.
- The behaviour is the same in every context, because the queue lives in the
  store rather than in the page that happens to be writing.

### Negative

- Writes are serialised, so a burst of changes takes as long as the sum of
  its parts. For a settings object of a few hundred bytes, that is not
  noticeable.
- The queue lives in one context. Two _different_ contexts — the options page
  and the worker — still have separate queues, so the cross-context case is
  covered by the storage-change listener rather than by the queue.

### Neutral

- The queue is an implementation detail of the store. Callers still just
  `await` the write.
