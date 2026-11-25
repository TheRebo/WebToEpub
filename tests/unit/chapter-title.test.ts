/**
 * Chapter titles.
 *
 * The numbers sites write into their chapter titles are removed only when
 * the user asks for it, and only when the number is unmistakably a chapter
 * number.
 */
import { describe, expect, it } from "vitest";
import { removeChapterNumber } from "../../src/core/util/chapter-title";

describe("removeChapterNumber", () => {
    it("removes a numbered chapter heading", () => {
        expect(removeChapterNumber("Chapter 12: The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("removes a number written with a dash", () => {
        expect(removeChapterNumber("Chapter 12 - The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("removes a number written with a full stop", () => {
        expect(removeChapterNumber("12. The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("removes a number written with a bracket", () => {
        expect(removeChapterNumber("12) The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("removes a number written with a hash", () => {
        expect(removeChapterNumber("#12 The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("removes a number that follows the word with no separator", () => {
        expect(removeChapterNumber("Chapter 12 The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("removes a French chapter heading", () => {
        expect(removeChapterNumber("Chapitre 12 : La Mer Tranquille")).toBe("La Mer Tranquille");
    });

    it("removes a Japanese chapter heading", () => {
        expect(removeChapterNumber("第12話 静かな海")).toBe("静かな海");
    });

    it("leaves a title that has no number alone", () => {
        expect(removeChapterNumber("The Quiet Sea")).toBe("The Quiet Sea");
    });

    it("leaves a title that only looks like a number alone", () => {
        expect(removeChapterNumber("12 Ways to Live")).toBe("12 Ways to Live");
    });

    it("leaves a title that is only a number alone", () => {
        expect(removeChapterNumber("12")).toBe("12");
    });

    it("leaves a title that is only a chapter word alone", () => {
        expect(removeChapterNumber("Chapter 12")).toBe("Chapter 12");
    });

    it("leaves an empty title alone", () => {
        expect(removeChapterNumber("")).toBe("");
    });

    it("keeps the surrounding spaces out of the result", () => {
        expect(removeChapterNumber("  Chapter 3: The Quiet Sea  ")).toBe("The Quiet Sea");
    });
});
