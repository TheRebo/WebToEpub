# ADR-0004 — Rewrite the fetch layer around `AbortSignal` and a single retry policy

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0001](ADR-0001-rewrite-from-scratch.md)

---

## Context

The baseline's network layer (`HttpClient.js`, 438 lines) has four defects
that materially damage the product:

1. **Cancellation does not work.** `util.sleep` listens to an
   `AbortController`, so the _inter-chapter delay_ is cancellable — but
   `HttpClient.wrapFetchImpl` calls `fetch(url, {credentials: "include"})`
   with **no `signal`**. An in-flight request therefore continues to
   completion, and its result is still processed. The user presses "Pause"
   and the download keeps going.

2. **Cookie cleanup is not in a `finally`.** `setPartitionCookies` creates
   _unpartitioned_ copies of the site's partitioned (CHIPS) cookies so that
   extension fetches can authenticate against Cloudflare-protected sites.
   `unsetPartitionCookies` is only called on the success path. On any network
   failure — DNS failure, offline, abort — those unpartitioned cookies are
   **left in the browser's cookie jar**, where they are sent to every site in
   that eTLD+1.

3. **The custom-error contract is broken.** `Parser.setCustomErrorResponse`
   builds a complete, correct response object and then `return {};`
   (`Parser.js:95`). `HttpClient.wrapFetchImpl` immediately dereferences it
   (`HttpClient.js:233-234`), producing a `TypeError` that the `catch` block
   converts into a generic fetch error. The captcha workflow — a headline
   feature — is dead, and the true error is masked.

4. **The retry policy is ad hoc.** Transient status codes are retried in one
   place, per-parser `retryDelay` sequences in another, and `fetchJson`/
   `fetchText` `delete` the `parser` key from the caller's options object, so
   a reused options object silently loses its error handling on the second
   call.

Additionally, `setDeclarativeNetRequestRules` removes **all** session rules
before adding its own, so two parsers configuring headers concurrently clobber
each other, and the cookie helper hardcodes `https://` regardless of the
page's protocol.

## Decision

We write a new fetch layer with these properties.

### 1. One `AbortController` per operation, threaded through everything

```ts
class FetchController {
    readonly signal: AbortSignal;
    abort(reason?: unknown): void;
}
```

The controller is created once per "Pack EPUB" operation and passed into
every `fetch` call as `signal`. Cancelling it aborts the in-flight request
_and_ the inter-chapter delay, so **Cancel actually stops the work**.

`AbortSignal.any()` composes the operation signal with a per-request timeout
signal, so every request has both a deadline and a cancellation path.

### 2. Cookie handling is scoped and always cleaned up

```ts
async function withUnpartitionedCookies<T>(
    url: URL,
    signal: AbortSignal,
    fn: () => Promise<T>,
): Promise<T> {
    const cookies = await readPartitionedCookies(url);
    const created = await installUnpartitionedCopies(cookies, url);
    try {
        return await fn();
    } finally {
        await removeUnpartitionedCopies(created); // always
    }
}
```

- The cleanup is in a `finally`, so it runs on success, failure, and abort.
- The cookie URL uses the **page's actual protocol**, not a hardcoded
  `https://`.
- The cookies are scoped to the registrable domain of the URL being fetched,
  and are removed by exact name + path, so we never touch a cookie we did
  not create.

### 3. The custom-error contract is explicit and total

```ts
export type CustomErrorResponse = {
    url: string;
    wrapOptions: WrapOptions;
    response: { url: string; status: number; retryDelay?: number[] };
    errorMessage?: string;
};
```

The interface is `setCustomErrorResponse?(...): CustomErrorResponse | undefined`.
Returning `undefined` means "not a custom error — fall through to the normal
path". There is no way to build a broken response: the type checker enforces
the shape, and a unit test asserts the baseline's exact response object is
produced by a reference implementation.

### 4. One retry policy, applied uniformly

```ts
interface RetryPolicy {
    /** Status codes that are worth retrying. */
    retryOnStatuses: number[];
    /** Delays in ms before each retry, in order. */
    delays: number[];
    /** Called before each retry; may return false to abort the retry chain. */
    beforeRetry?: (
        attempt: number,
        error: FetchError,
    ) => boolean | Promise<boolean>;
}
```

- Transient statuses (`429, 500, 502, 503, 504, 520, 522, 524`) use the
  baseline's behaviour.
- A parser that declares `isCustomError` supplies its own `beforeRetry`,
  which is how the captcha workflow is expressed: `403` prompts the user,
  and the retry chain runs on a per-parser `retryDelay` sequence.
- **Retry options are copied, never mutated.** The baseline's
  `delete fetchOptions.parser` bug cannot recur.

### 5. DNR rules are additive and scoped

`setDeclarativeNetRequestRules` computes the **delta** against the currently
installed session rules and only removes the rules it owns (tagged with the
extension's rule ids). Two parsers can coexist. Rules remain restricted to
the extension's own `initiatorDomains`.

## Alternatives considered

| Alternative                                                                  | Why rejected                                                                                                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch the baseline `HttpClient` in place                                     | The module's shape (globals, mutable `blockedSites`, callback-style handlers) is the problem, not its individual bugs.                                               |
| Use a library (`got`, `axios`)                                               | ~15–40 KB for functionality we need in ~250 lines, and it would hide the `signal`/`finally` discipline we are trying to make explicit.                               |
| Keep the `cookies` permission but skip the unpartitioned workaround entirely | The workaround is required for a meaningful subset of Cloudflare-protected sites; dropping it is a product regression. We keep it but make it correct and leak-free. |
| Implement cancellation only via `util.sleep`                                 | That is the baseline's approach and it does not work. Rejected.                                                                                                      |
| Retry only at the parser level                                               | Duplicates the policy in 437 places. Rejected.                                                                                                                       |

## Consequences

**Positive**

- **Cancel actually cancels.** The in-flight HTTP request is aborted.
- **No cookie leakage.** The `finally` guarantee removes the cross-site
  cookie exposure entirely.
- **The captcha workflow works again**, and the type system makes the broken
  response shape impossible.
- One retry policy, uniformly applied and testable.
- Concurrent DNR configurations no longer clobber each other.

**Negative**

- `AbortController` plumbing has to be threaded through every call site,
  including every parser that overrides `fetchChapter`. The compat shim
  ([ADR-0002](ADR-0002-parser-contract.md)) supplies the controller from the
  parser's ambient context so parsers do not have to change.
- Retry behaviour changes subtly for parsers that relied on the baseline's
  ad-hoc handling. The parity harness
  ([ADR-0002](ADR-0002-parser-contract.md)) checks chapter-level outcomes.

**Neutral**

- The minimum throttle remains 500 ms by default and `maxSimultanousFetchSize`
  remains 1. Politeness is not negotiable.
