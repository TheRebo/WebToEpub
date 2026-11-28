/**
 * Keeping only the newest of a series of overlapping operations.
 *
 * Some work takes long enough that the user can start it again before the
 * first attempt has finished. The two then overlap, and the older one may
 * finish last — so it applies its result *after* the newer one, and the user
 * is left looking at the result of the thing they moved away from.
 *
 * This is the pattern the guard exists for: every attempt takes a number, and
 * an attempt only applies its result while its number is still the newest.
 * A late answer is discarded.
 *
 * It is used by the workbench, which reads a story's metadata and then its
 * chapter list, and by the options page, which reads a list when its panel
 * is opened.
 */

/** A guard that numbers attempts and says which of them is still current. */
export class LatestOnly {
    /** The number of the newest attempt. */
    #current = 0;

    /**
     * Start an attempt.
     *
     * @returns The attempt's number.
     */
    begin(): number {
        this.#current += 1;
        return this.#current;
    }

    /**
     * Whether an attempt is still the newest one.
     *
     * @param number The attempt's number.
     * @returns `true` when the attempt's result is still wanted.
     */
    isCurrent(number: number): boolean {
        return number === this.#current;
    }

    /**
     * The number of the newest attempt.
     *
     * @returns The current number.
     */
    get current(): number {
        return this.#current;
    }
}
