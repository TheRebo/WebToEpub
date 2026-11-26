/**
 * The limits a library import works within.
 *
 * An import is a file the user chose, but it is still a file from somewhere,
 * and an archive is a thing that can lie about its size. Every read in an
 * import is therefore bounded: an archive that says it holds a gigabyte, or
 * that expands to one, is refused rather than believed.
 *
 * These numbers live in their own module so that the page can ask how big a
 * file may be — before reading it — without loading the archive reader with
 * it. See ADR-0035.
 */
import { UserFacingErrorError } from "../util/errors";

/**
 * The limits an import works within.
 *
 * The numbers are generous enough for any library a person could plausibly
 * have — hundreds of books, each with a cover — and small enough that a
 * crafted archive cannot ask the browser for more memory than it should
 * spend. They are part of the import's contract rather than a private detail,
 * so that a caller can tighten them.
 */
export interface ImportLimits {
    /** The largest archive that may be read, in bytes. */
    maxArchiveBytes: number;
    /** The largest single entry that may be decompressed, in bytes. */
    maxEntryBytes: number;
    /** The largest total that may be decompressed in one import, in bytes. */
    maxTotalBytes: number;
    /** The largest number of entries an archive may list. */
    maxEntries: number;
}

/**
 * The limits an import uses unless the caller says otherwise.
 *
 * A book's own EPUB is stored in the export as a base64 data URL, so an entry
 * runs to about a third more than the book does. 64 MB per entry leaves room
 * for a very large illustrated book; 512 MB in total covers a large library.
 */
export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
    maxArchiveBytes: 256 * 1024 * 1024,
    maxEntryBytes: 64 * 1024 * 1024,
    maxTotalBytes: 512 * 1024 * 1024,
    maxEntries: 10_000,
};

/**
 * The error raised when an archive asks for more than the limits allow.
 *
 * It is a distinct type so that a limit is never mistaken for a corrupt
 * file: a limit is reported to the user as a refusal, while a file that
 * cannot be read is skipped.
 *
 * It is a user-facing error, so that the sentence survives the trip across
 * the message bus to the page that asked for the import. A plain exception
 * would arrive as "Could not reach the site", which would send the user
 * looking in entirely the wrong place.
 */
export class ImportLimitError extends UserFacingErrorError {
    /**
     * @param message The message to show.
     */
    constructor(message: string) {
        super(message, "UNSUPPORTED");
        this.name = "ImportLimitError";
    }
}
