/**
 * The rule that decides what the extension is allowed to fetch.
 *
 * The extension fetches from its own privileged context, where it can reach
 * further than the page that asked. That makes two different questions
 * important, and they have two different answers:
 *
 * - **May this URL be fetched at all?** Only an absolute `http:` or `https:`
 *   URL may. A `file:` URL, a `data:` URL and a `blob:` URL never may.
 * - **May this host be reached?** A public host may, because that is what the
 *   extension is for. A host that names the user's own machine or a private
 *   network may only when the user has explicitly allowed that host — a
 *   story served from a home server is a real thing, but a table of contents
 *   that links to `http://169.254.169.254/latest/meta-data/` is an attack, and
 *   the difference between the two is the user's own grant.
 *
 * See ADR-0032.
 */
import { hasSpecificHostAccess } from "../host-access";
import { isPrivateHost, validateFetchableUrl } from "../util/sanitize";

/**
 * Whether the extension may fetch a URL.
 *
 * @param url The URL.
 * @returns The parsed URL when the fetch may go ahead, or `null` when it may not.
 */
export async function mayFetchUrl(url: string): Promise<URL | null> {
    // The shape is checked first, without the private-host rule: a URL that is
    // not a web address is refused whatever the user has allowed.
    const parsed = validateFetchableUrl(url, { allowPrivate: true });
    if (!parsed) return null;

    // A public host is what the extension is for.
    if (!isPrivateHost(parsed.hostname)) return parsed;

    // A private host is fetched only when the user has given the extension
    // access to it *by name*. The grant is per host, so a table of contents
    // cannot use one allowed site to reach a machine the user never allowed.
    //
    // The check is for a named grant and not for "any grant that covers this
    // host": the extension's own optional permission covers every http and
    // https host on the web, and reading that as a grant to the user's local
    // network would leave the machine open to any page that links to it.
    if (await hasSpecificHostAccess(parsed.origin)) return parsed;

    return null;
}
