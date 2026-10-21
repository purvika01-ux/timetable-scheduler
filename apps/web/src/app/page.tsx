import { t } from "@/lib/i18n";

// Placeholder home page. Product name and brand are OPEN (U1); real screens arrive in Phase 8.
export default function Home() {
  const locale = "en";
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="inline-block border border-current px-2 py-1 text-sm tracking-wider">
        {t(locale, "app.name")}
      </p>
      <h1 className="mt-6 text-3xl font-semibold leading-tight">{t(locale, "app.tagline")}</h1>
      <p className="mt-4 text-base">{t(locale, "home.status")}</p>
      <p className="mt-8 text-base" lang="pa">
        {t("pa", "app.tagline")}
      </p>
    </main>
  );
}
