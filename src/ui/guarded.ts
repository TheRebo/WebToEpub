/**
 * Starting work the user asked for, without waiting for it.
 *
 * An event handler cannot be `async`: the browser's event system does not wait
 * for the handler, so the handler's promise is dropped on the floor and a
 * rejection from it is never handled. The browser logs an unhandled rejection,
 * the user is told nothing, and the thing they asked for silently does not
 * happen.
 *
 * `void promise` does not help. It says "I know this returns a promise"; it
 * does not say "I have dealt with what happens if it fails".
 *
 * So the work is started through {@link runGuarded}, which catches the failure
 * and hands it to something that can show it.
 */

/**
 * Start work, and report a failure instead of dropping it.
 *
 * @param work The work to do.
 * @param report What to do with a failure. It is given the caught value, which
 *   may be anything that was thrown.
 */
export function runGuarded(work: () => Promise<unknown>, report: (error: unknown) => void): void {
    void work().catch(report);
}
