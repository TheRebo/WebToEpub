/**
 * The icon set.
 *
 * One set, drawn on a 24×24 grid with a 2 px stroke, round caps and round
 * joins. Icons inherit `currentColor` and never hardcode a colour, so they
 * work in every theme without a second variant.
 *
 * The paths are written as plain data rather than as individual components,
 * because a component per icon would mean a custom element per glyph and a
 * custom element registration for every use.
 */

/** The names of the icons in the set. */
export type IconName =
    | "book"
    | "chevron-down"
    | "chevron-right"
    | "chevron-left"
    | "check"
    | "close"
    | "download"
    | "filter"
    | "image"
    | "info"
    | "invert"
    | "link"
    | "list"
    | "menu"
    | "minus"
    | "pause"
    | "play"
    | "plus"
    | "refresh"
    | "search"
    | "settings"
    | "sparkle"
    | "spinner"
    | "warning"
    | "wrench"
    | "empty-circle"
    | "half-circle"
    | "filled-circle"
    | "check-circle"
    | "alert-triangle"
    | "arrow-right"
    | "external-link";

/** The path data for each icon. */
const PATHS: Record<IconName, string[]> = {
    book: [
        "M4 4.5A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 22.5v-18Z",
        "M4 17.5A2.5 2.5 0 0 1 6.5 15H20",
    ],
    "chevron-down": ["m6 9 6 6 6-6"],
    "chevron-right": ["m9 6 6 6-6 6"],
    "chevron-left": ["m15 6-6 6 6 6"],
    check: ["m5 13 4 4L19 7"],
    close: ["M6 6l12 12M18 6L6 18"],
    download: ["M12 3v12", "m7 11 5 5 5-5", "M4 20h16"],
    filter: ["M3 5h18l-7 8v6l-4 2v-8L3 5Z"],
    image: [
        "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
        "m3 16 4.5-4.5 3 3L15 10l6 6",
        "M8.5 9.5h.01",
    ],
    info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 11v5", "M12 8h.01"],
    invert: ["M7 4v16", "M17 4v16", "M7 12h10"],
    link: [
        "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7",
        "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
    ],
    list: ["M8 6h13M8 12h13M8 18h13", "M3.5 6h.01M3.5 12h.01M3.5 18h.01"],
    menu: ["M4 6h16M4 12h16M4 18h16"],
    minus: ["M6 12h12"],
    pause: ["M9 5v14M15 5v14"],
    play: ["m7 4 12 8-12 8V4Z"],
    plus: ["M12 5v14M5 12h14"],
    refresh: ["M20 12a8 8 0 1 1-2.3-5.7", "M20 4v5h-5"],
    search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
    settings: [
        "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
        "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z",
    ],
    sparkle: [
        "m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z",
        "m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z",
    ],
    spinner: ["M12 3a9 9 0 1 0 9 9"],
    warning: ["M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z", "M12 9v4", "M12 17h.01"],
    wrench: [
        "M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4l9-9Z",
        "m14.7 6.3-3-3",
    ],
    "empty-circle": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
    "half-circle": [
        "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
        "M12 3a9 9 0 0 1 0 18Z",
    ],
    "filled-circle": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
    "check-circle": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "m8.5 12 2.5 2.5 4.5-5"],
    "alert-triangle": [
        "M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
        "M12 9v4",
        "M12 17h.01",
    ],
    "arrow-right": ["M4 12h16", "m14 6 6 6-6 6"],
    "external-link": ["M14 4h6v6", "m20 4-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
};

/** The SVG markup for an icon. */
export function iconSvg(name: IconName, size = 20): string {
    const paths = PATHS[name] ?? PATHS.info;
    const body = paths
        .map((d) => `<path d="${d}"/>`)
        .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Every icon's name. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/**
 * The icon element for a name, as an SVG string.
 *
 * The markup is inserted with `innerHTML` only from this module, where every
 * path is a literal constant. No untrusted data reaches it.
 */
export function createIcon(name: IconName, size = 20): SVGElement {
    const template = document.createElement("template");
    template.innerHTML = iconSvg(name, size);
    return template.content.firstElementChild as SVGElement;
}
