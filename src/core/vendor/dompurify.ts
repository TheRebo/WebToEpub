/**
 * The vendored DOMPurify build.
 *
 * DOMPurify is third-party code that ships verbatim. It is kept behind its own
 * module so that:
 *
 *  - the build can emit it as a **separate** bundle file, which lets the
 *    extension linter skip it explicitly (`web-ext lint --ignore-files`) rather
 *    than muting a rule for our own code, and
 *  - the rest of the codebase never imports from `dompurify` directly, so
 *    there is exactly one place where the dependency is wired in.
 *
 * DOMPurify's own source contains one `innerHTML` assignment, in the fallback
 * path it takes when `DOMParser` is unavailable. That path is unreachable in
 * Firefox, and the assignment is inside the library's own sanitiser — not in
 * code we wrote. See `docs/architecture/README.md` §Vendored dependencies.
 */
import DOMPurify from "dompurify";

export default DOMPurify;
export { DOMPurify };
