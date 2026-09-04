import { afterEach, describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { uiMessages } from "@/lib/i18n/data";
import { extraMessages } from "@/lib/i18n/extra";
import { overrideCount, setTranslationOverrides } from "@/lib/i18n/overrides";
import { allKeys, coverage, fileValue, isDecorative, DECORATIVE_ENGLISH } from "@/lib/i18n/keys";
import { findLeaks, readLangDir, stripInvisible, visibleText } from "@/lib/i18n/leak";
import { faqSchema, industrySchema, navigationSchema, productSchema, serviceSchema, titleBodySchema } from "@/lib/schemas/content";
import { services as fileServices } from "@/lib/services";
import { industries as fileIndustries } from "@/lib/industries";
import { products as fileProducts } from "@/lib/products";

afterEach(() => setTranslationOverrides({}));

describe("translation lookup order", () => {
  it("regresses nothing: with no overrides, every translated string resolves exactly as before", () => {
    setTranslationOverrides({});
    expect(overrideCount()).toBe(0);
    let checked = 0;
    for (const locale of ["ar", "ur", "fr", "es"]) {
      for (const [key, value] of Object.entries(uiMessages[locale] ?? {})) {
        expect(t(key, locale)).toBe(value);
        checked += 1;
      }
      for (const [key, value] of Object.entries(extraMessages[locale] ?? {})) {
        // uiMessages wins where both files carry a key, which is the order
        // that shipped before this layer existed.
        expect(t(key, locale)).toBe(uiMessages[locale]?.[key] ?? value);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("puts a database override ahead of both files", () => {
    const key = Object.keys(extraMessages.fr ?? {})[0];
    expect(typeof key).toBe("string");
    const fromFile = t(key, "fr");
    setTranslationOverrides({ fr: { [key]: "Valeur remplacée" } });
    expect(t(key, "fr")).toBe("Valeur remplacée");
    expect(t(key, "es")).not.toBe("Valeur remplacée");
    setTranslationOverrides({});
    expect(t(key, "fr")).toBe(fromFile);
  });

  it("never overrides English, and falls through to English for an unknown string", () => {
    setTranslationOverrides({ en: { Hello: "Bonjour" }, fr: { Hello: "Bonjour" } });
    expect(t("Hello", "en")).toBe("Hello");
    expect(t("Hello", "fr")).toBe("Bonjour");
    expect(t("A string nobody has translated", "fr")).toBe("A string nobody has translated");
  });
});

describe("dictionary key space", () => {
  it("covers the whole space and excludes the decorative labels", () => {
    const keys = allKeys();
    expect(keys.length).toBeGreaterThan(300);
    const names = new Set(keys.map((k) => k.key));
    for (const label of DECORATIVE_ENGLISH) {
      expect(isDecorative(label)).toBe(true);
      expect(names.has(label)).toBe(false);
    }
    // Every key resolves in at least one locale, or it would not be a key.
    for (const { key } of keys.slice(0, 50)) {
      expect(["ar", "ur", "fr", "es"].some((l) => typeof fileValue(l, key) === "string")).toBe(true);
    }
  });

  it("reports coverage per locale and counts overrides separately", () => {
    const before = coverage({});
    expect(before.map((c) => c.locale).sort()).toEqual(["ar", "es", "fr", "ur"]);
    for (const c of before) {
      expect(c.fromDatabase).toBe(0);
      expect(c.translated + c.missing).toBe(c.total);
      expect(c.percent).toBeGreaterThan(50);
    }
    const key = allKeys()[0].key;
    const after = coverage({ fr: { [key]: "Une valeur" } });
    expect(after.find((c) => c.locale === "fr")!.fromDatabase).toBe(1);
  });
});

describe("leak detection", () => {
  const page = (body: string, lang = "fr", dir = "ltr") =>
    `<!doctype html><html lang="${lang}" dir="${dir}"><head><title>Nos services</title><meta name="description" content="What We Do"></head><body>${body}<script>self.__next_f.push([1,"What We Do"])</script></body></html>`;

  it("ignores the head and the script payload, which is the whole point", () => {
    // "What We Do" appears in the title, a meta tag and the flight payload,
    // exactly as it does on a correctly translated page.
    const html = page("<p>Ce que nous faisons</p>");
    expect(html).toContain("What We Do");
    expect(visibleText(html)).toBe("Ce que nous faisons");
    expect(findLeaks(html, "fr")).toEqual([]);
  });

  it("reports a string the locale translates but the page still shows in English", () => {
    const leaks = findLeaks(page("<p>What We Do</p>"), "fr");
    expect(leaks.map((l) => l.key)).toContain("What We Do");
    expect(leaks[0].context).toContain("What We Do");
  });

  it("says nothing about a key this locale does not translate", () => {
    const leaks = findLeaks(page("<p>Some untranslated phrase</p>"), "fr", { keys: [{ key: "Some untranslated phrase" }], translated: () => undefined });
    expect(leaks).toEqual([]);
  });

  it("leaves content regions alone, because post titles stay English by design", () => {
    const withMarker = page(`<div data-i18n="content">What We Do</div>`);
    expect(stripInvisible(withMarker)).not.toContain("What We Do");
    expect(findLeaks(withMarker, "fr")).toEqual([]);
    // The same words as chrome are still caught.
    expect(findLeaks(page("<div>What We Do</div>"), "fr").length).toBeGreaterThan(0);
  });

  it("matches whole phrases only, so a key cannot fire inside a longer word", () => {
    const leaks = findLeaks(page("<p>Contactez-nous</p>"), "fr", { keys: [{ key: "Contact" }], translated: () => "Contact" });
    expect(leaks).toEqual([]);
  });

  it("reads lang and dir so an RTL locale can be checked", () => {
    expect(readLangDir(page("<p>x</p>", "ar", "rtl"))).toEqual({ lang: "ar", dir: "rtl" });
    expect(readLangDir("<html><body></body></html>")).toEqual({ lang: null, dir: null });
  });
});

describe("content schemas mirror the typed files", () => {
  it("accepts every service, industry and product exactly as it ships", () => {
    for (const s of fileServices) expect(serviceSchema.safeParse(s).success, `service ${s.slug}`).toBe(true);
    for (const i of fileIndustries) expect(industrySchema.safeParse(i).success, `industry ${i.slug}`).toBe(true);
    for (const p of fileProducts) expect(productSchema.safeParse(p).success, `product ${p.slug}`).toBe(true);
  });

  it("keeps the optional shapes optional, and absent when absent", () => {
    const minimal = { slug: "a-service", pillar: "ai-data", title: "T", blurb: "B", intro: "I", capabilities: ["one"], tech: [] };
    const parsed = serviceSchema.parse(minimal);
    expect("outcomes" in parsed).toBe(false);
    expect("faqs" in parsed).toBe(false);
    // Present means it must keep its shape.
    expect(serviceSchema.safeParse({ ...minimal, faqs: [{ q: "Q", a: "A" }] }).success).toBe(true);
  });

  it("refuses a half-filled FAQ, because it would emit invalid structured data", () => {
    expect(faqSchema.safeParse({ q: "Question", a: "Answer" }).success).toBe(true);
    expect(faqSchema.safeParse({ q: "Question", a: "" }).success).toBe(false);
    expect(faqSchema.safeParse({ q: "", a: "Answer" }).success).toBe(false);
    expect(titleBodySchema.safeParse({ title: "T", body: "" }).success).toBe(false);
  });
});

describe("navigation", () => {
  it("takes site paths, absolute URLs and mailto links, and refuses anything else", () => {
    const ok = navigationSchema.safeParse({
      primary: [{ label: "What We Do", href: "/what-we-do" }],
      company: [{ label: "Contact", href: "mailto:info@develmo.com" }],
    });
    expect(ok.success).toBe(true);
    expect(navigationSchema.safeParse({ primary: [{ label: "X", href: "what-we-do" }], company: [{ label: "Y", href: "/x" }] }).success).toBe(false);
    expect(navigationSchema.safeParse({ primary: [], company: [{ label: "Y", href: "/x" }] }).success).toBe(false);
    expect(navigationSchema.safeParse({ primary: [{ label: "", href: "/x" }], company: [{ label: "Y", href: "/x" }] }).success).toBe(false);
  });
});
