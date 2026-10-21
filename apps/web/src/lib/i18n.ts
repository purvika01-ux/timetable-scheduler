// Minimal message lookup for Phase 0. Phase 7 replaces this with the full i18n setup.
import en from "../../messages/en.json";
import pa from "../../messages/pa.json";

export const locales = ["en", "pa"] as const;
export type Locale = (typeof locales)[number];
export type MessageKey = keyof typeof en;

export const catalogues: Record<Locale, Record<string, string>> = { en, pa };

/** Returns the message for `key`, falling back to English when a translation is missing. */
export function t(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key] ?? catalogues.en[key];
}
