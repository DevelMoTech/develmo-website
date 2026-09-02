import { describe, expect, it } from "vitest";
import { isValidSlug, nextSlug, readingTimeMinutes, slugify, SLUG_MAX } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, hyphenates and trims", () => {
    expect(slugify("Turn existing cameras into measurable business insight")).toBe("turn-existing-cameras-into-measurable-business-insight");
    expect(slugify("  Hello,   World!  ")).toBe("hello-world");
    expect(slugify("--already--slugged--")).toBe("already-slugged");
  });

  it("drops apostrophes and quotes instead of hyphenating them", () => {
    expect(slugify(`What "AI that fits" actually means`)).toBe("what-ai-that-fits-actually-means");
    expect(slugify("Don't panic")).toBe("dont-panic");
    expect(slugify("It’s here")).toBe("its-here");
  });

  it("transliterates accents and ligatures, spells out ampersands", () => {
    expect(slugify("Café résumé naïve")).toBe("cafe-resume-naive");
    expect(slugify("Straße Ærø")).toBe("strasse-aero");
    expect(slugify("AI & Data")).toBe("ai-and-data");
  });

  it("keeps digits and separates them from words only at non-alphanumerics", () => {
    expect(slugify("CI/CD in 2026")).toBe("ci-cd-in-2026");
    expect(slugify("v2.0 release")).toBe("v2-0-release");
  });

  it("returns an empty slug for input with nothing usable", () => {
    expect(slugify("!!! ???")).toBe("");
    expect(slugify("العربية")).toBe("");
  });

  it("truncates to the limit on a word boundary", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s.endsWith("-")).toBe(false);
    expect(isValidSlug(s)).toBe(true);
    expect(slugify("a".repeat(200)).length).toBe(SLUG_MAX);
  });

  it("always yields something isValidSlug accepts, or empty", () => {
    for (const input of ["Hello", "x", "9 lives", "ÜBER cool", "a---b", "tab\tand\nnewline"]) {
      const s = slugify(input);
      expect(s === "" || isValidSlug(s), input).toBe(true);
    }
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidSlug("my-post")).toBe(true);
    expect(isValidSlug("post2")).toBe(true);
  });
  it("rejects uppercase, spaces, leading/trailing or doubled hyphens and other characters", () => {
    for (const bad of ["", "My-Post", "my post", "-my-post", "my-post-", "my--post", "my_post", "my.post", "a/b", "a".repeat(SLUG_MAX + 1)]) {
      expect(isValidSlug(bad), bad).toBe(false);
    }
  });
});

describe("nextSlug", () => {
  it("appends or increments a numeric suffix", () => {
    expect(nextSlug("my-post")).toBe("my-post-2");
    expect(nextSlug("my-post-2")).toBe("my-post-3");
    expect(nextSlug("post-2026")).toBe("post-2027");
  });
});

describe("readingTimeMinutes", () => {
  it("is zero for empty text and at least one minute for anything else", () => {
    expect(readingTimeMinutes("")).toBe(0);
    expect(readingTimeMinutes("Just a few words.")).toBe(1);
  });
  it("counts roughly 200 words per minute and ignores code and image syntax", () => {
    const words = Array.from({ length: 1000 }, () => "word").join(" ");
    expect(readingTimeMinutes(words)).toBe(5);
    expect(readingTimeMinutes(`${words}\n\n\`\`\`js\n${"code ".repeat(600)}\n\`\`\`\n![alt](/media/x.jpg)`)).toBe(5);
  });
});
