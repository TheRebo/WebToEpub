# ADR-0029 — A diagnostics logger that is off by default

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** The Kintsugi revamp
- **Relates to:** [ADR-0023](./ADR-0023-url-redaction.md), [ADR-0022](./ADR-0022-settings-enforcement.md)

## Context

The options page has a "Developer diagnostics" switch, and the development
guide tells the reader to turn it on when they report a broken site. The audit
found that nothing read the setting: the switch was stored, validated, shown
in the UI — and then did nothing. The guide was wrong, and a user following it
would have sent a bug report with no diagnostics in it.

At the same time, the extension makes two promises that a careless logger
would break:

- `PRIVACY.md` promises that nothing is sent anywhere. There is no telemetry.
- `docs/development.md` promises that nothing is written to the console in a
  normal installation.

Both promises are true of the extension as it stands, and both are false the
moment a `console.log` is left in a hot path.

## Decision

We will have exactly one logging facility, and it will be off by default.

- `src/core/util/diagnostics.ts` is the only module that writes to the
  console. `diagnostic()` and `diagnosticUrl()` are its two entry points.
- The logger is enabled by the `behaviour.diagnostics` setting, read through
  the settings store, and it is off in a fresh installation.
- The logger records **shapes, not content**: how many chapters, which
  parser, how long a request took. It never records the text of a chapter, a
  cookie, or a token.
- A URL is redacted before it is logged. See [ADR-0023](./ADR-0023-url-redaction.md).
- The message is built only when the logger is on, so a caller can pass an
  expensive expression without paying for it in the normal case.
- Everything goes to the browser's console, which the user can see and clear.
  Nothing is written to a file, and nothing is sent anywhere.

## Alternatives considered

| Option                                              | Why it was rejected                                                                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leave the `console.log` calls where they are        | The promises in `PRIVACY.md` and the development guide would be false, and there would be no way to turn the noise off.                                     |
| Write the diagnostics to a file the user can attach | A diagnostic log is a file full of story URLs and site names. It would outlive the console, be attached to a public issue, and need its own deletion story. |
| Send the diagnostics to a server                    | That is telemetry. It would need a policy, an endpoint, and a retention period, and the extension has deliberately none of those.                           |
| A verbose level rather than a switch                | A level needs a place to set it, and the settings page is the place users look. A boolean switch is clearer than a dropdown for an on/off concern.          |

## Consequences

### Positive

- The development guide is now true: turning the switch on produces
  diagnostics, and turning it off produces silence.
- There is one place to look when deciding whether a log line is acceptable.
- The promise of no telemetry is enforced by the shape of the API rather than
  by remembering not to add a `console.log`.

### Negative

- A diagnostic that is only useful with the switch on cannot be debugged by
  simply opening the console. Turning the switch on is one click, and the
  guide says so, but it is a step.
- The logger cannot record a story's content, even for debugging. That is the
  point, but it does mean a bug that only shows up in the content itself
  cannot be diagnosed from the log.

### Neutral

- The switch lives in the behaviour group, next to the other switches, and is
  labelled as a developer option rather than as a user preference.
