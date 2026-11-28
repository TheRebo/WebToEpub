/**
 * The stand-in for an image that is not in the book.
 *
 * Two things need one: an image the site refused to give, and an SVG the
 * user does not want. In both cases the reader should see a picture-shaped
 * mark rather than a gap or a broken image.
 *
 * The mark is a PNG, not an SVG. A book that carries SVG files is a book that
 * many readers — most e-readers — cannot show, and the extension has a
 * setting that says exactly that. A placeholder that was itself an SVG would
 * have defeated the setting it was standing in for.
 *
 * See ADR-0029.
 */
import { encodePng } from "./png";

/** A picture, and the address it came from. */
export interface PlaceholderImage {
    /** The picture's bytes. */
    data: Uint8Array;
    /** The media type. */
    mediaType: string;
    /** The address the picture stands in for. */
    url: string;
}

/** The placeholder's width, in pixels. */
const WIDTH = 400;

/** The placeholder's height, in pixels. */
const HEIGHT = 300;

/** The paper the mark is drawn on. */
const BACKGROUND: RGB = [242, 239, 232];

/** The rule around the mark. */
const BORDER: RGB = [207, 200, 185];

/** The far hill. */
const FAR_HILL: RGB = [229, 224, 213];

/** The near hill. */
const NEAR_HILL: RGB = [216, 210, 196];

/** The sun. */
const SUN: RGB = [207, 199, 180];

/** A colour, as three bytes. */
type RGB = [number, number, number];

/**
 * The address the placeholder stands under.
 *
 * Every missing image shares one file in the book: the mark is the same
 * every time, so a book with fifty missing pictures carries one copy of it
 * rather than fifty.
 */
export const PLACEHOLDER_URL = "kintsugi:missing-image";

/**
 * Build the stand-in for an image.
 *
 * The mark is the same every time, so it is drawn and encoded once and the
 * bytes are shared.
 *
 * @returns The picture.
 */
export function buildPlaceholderImage(): PlaceholderImage {
    return {
        data: placeholderBytes(),
        mediaType: "image/png",
        url: PLACEHOLDER_URL,
    };
}

/**
 * The mark's bytes, drawn and encoded the first time they are asked for.
 */
let cached: Uint8Array | undefined;

/**
 * The mark's bytes.
 *
 * @returns The bytes.
 */
function placeholderBytes(): Uint8Array {
    if (cached) return cached;

    const canvas = new Canvas(WIDTH, HEIGHT, BACKGROUND);

    // The rule around the mark.
    canvas.frame(3, BORDER);

    // The sun, and the two hills it sits behind.
    canvas.circle(140, 100, 26, SUN);
    canvas.triangle([90, 210, 170, 108, 250, 210], FAR_HILL);
    canvas.triangle([176, 210, 262, 116, 348, 210], NEAR_HILL);

    // The ground the hills stand on.
    canvas.rect(0, 210, WIDTH, 2, BORDER);

    cached = encodePng(WIDTH, HEIGHT, canvas.pixels);
    return cached;
}

/**
 * A picture being drawn.
 *
 * The drawing is done by hand because the shapes a placeholder needs — a
 * frame, a circle, a triangle — are three shapes, and a drawing library
 * would be more code than the three shapes.
 */
class Canvas {
    /** The picture's pixels, three bytes each. */
    readonly pixels: Uint8Array;

    /**
     * @param width The picture's width, in pixels.
     * @param height The picture's height, in pixels.
     * @param background The colour the picture starts as.
     */
    constructor(
        readonly width: number,
        readonly height: number,
        background: RGB,
    ) {
        this.pixels = new Uint8Array(width * height * 3);
        this.rect(0, 0, width, height, background);
    }

    /**
     * Fill a rectangle.
     *
     * @param x The left edge.
     * @param y The top edge.
     * @param width The width, in pixels.
     * @param height The height, in pixels.
     * @param colour The colour to fill with.
     */
    rect(x: number, y: number, width: number, height: number, colour: RGB): void {
        for (let row = y; row < y + height; row += 1) {
            for (let column = x; column < x + width; column += 1) {
                this.pixel(column, row, colour);
            }
        }
    }

    /**
     * Draw a rule around the edge of the picture.
     *
     * @param thickness The rule's thickness, in pixels.
     * @param colour The colour to draw it in.
     */
    frame(thickness: number, colour: RGB): void {
        this.rect(0, 0, this.width, thickness, colour);
        this.rect(0, this.height - thickness, this.width, thickness, colour);
        this.rect(0, 0, thickness, this.height, colour);
        this.rect(this.width - thickness, 0, thickness, this.height, colour);
    }

    /**
     * Fill a circle.
     *
     * @param centreX The circle's centre, horizontally.
     * @param centreY The circle's centre, vertically.
     * @param radius The circle's radius, in pixels.
     * @param colour The colour to fill with.
     */
    circle(centreX: number, centreY: number, radius: number, colour: RGB): void {
        for (let row = centreY - radius; row <= centreY + radius; row += 1) {
            for (let column = centreX - radius; column <= centreX + radius; column += 1) {
                const dx = column - centreX;
                const dy = row - centreY;
                if (dx * dx + dy * dy <= radius * radius) this.pixel(column, row, colour);
            }
        }
    }

    /**
     * Fill a triangle.
     *
     * @param points The triangle's three corners.
     * @param colour The colour to fill with.
     */
    triangle(points: number[], colour: RGB): void {
        const [ax, ay, bx, by, cx, cy] = points as [number, number, number, number, number, number];
        const minX = Math.max(0, Math.min(ax, bx, cx));
        const maxX = Math.min(this.width - 1, Math.max(ax, bx, cx));
        const minY = Math.max(0, Math.min(ay, by, cy));
        const maxY = Math.min(this.height - 1, Math.max(ay, by, cy));

        for (let row = minY; row <= maxY; row += 1) {
            for (let column = minX; column <= maxX; column += 1) {
                const first = cross(ax, ay, bx, by, column, row);
                const second = cross(bx, by, cx, cy, column, row);
                const third = cross(cx, cy, ax, ay, column, row);
                const hasNegative = first < 0 || second < 0 || third < 0;
                const hasPositive = first > 0 || second > 0 || third > 0;
                if (!(hasNegative && hasPositive)) this.pixel(column, row, colour);
            }
        }
    }

    /**
     * Set one pixel.
     *
     * A pixel outside the picture is ignored, so that a shape may run off
     * the edge without wrapping around to the other side.
     *
     * @param x The pixel's column.
     * @param y The pixel's row.
     * @param colour The colour to set.
     */
    private pixel(x: number, y: number, colour: RGB): void {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
        const offset = (y * this.width + x) * 3;
        this.pixels[offset] = colour[0];
        this.pixels[offset + 1] = colour[1];
        this.pixels[offset + 2] = colour[2];
    }
}

/**
 * The cross product of two edges, which says which side of an edge a point
 * falls on.
 *
 * @param ax The first edge's start, horizontally.
 * @param ay The first edge's start, vertically.
 * @param bx The first edge's end, horizontally.
 * @param by The first edge's end, vertically.
 * @param px The point, horizontally.
 * @param py The point, vertically.
 * @returns The cross product.
 */
function cross(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
