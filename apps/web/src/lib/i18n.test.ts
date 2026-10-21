import { describe, expect, it } from "vitest";
import { catalogues, locales, t } from "./i18n";

describe("i18n catalogues", () => {
  it("every locale has exactly the English keys", () => {
    const englishKeys = Object.keys(catalogues.en).sort();
    for (const locale of locales) {
      expect(Object.keys(catalogues[locale]).sort()).toEqual(englishKeys);
    }
  });

  it("no message is empty", () => {
    for (const locale of locales) {
      for (const value of Object.values(catalogues[locale])) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("looks up a message by locale", () => {
    expect(t("en", "app.name")).toBe("Timetable");
    expect(t("pa", "app.name")).toBe("ਸਮਾਂ-ਸਾਰਣੀ");
  });
});
