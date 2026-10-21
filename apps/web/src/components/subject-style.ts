import type { SubjectColor } from "@/lib/timetable/types.ts";

// Full class strings so Tailwind can see them. Meaning never relies on colour alone:
// every card also shows the subject code and name.
export const SUBJECT_STYLE: Record<SubjectColor, { card: string; accent: string; dot: string }> = {
  blue: { card: "bg-blue-50 border-blue-200 text-blue-950", accent: "bg-blue-600", dot: "bg-blue-500" },
  emerald: { card: "bg-emerald-50 border-emerald-200 text-emerald-950", accent: "bg-emerald-600", dot: "bg-emerald-500" },
  amber: { card: "bg-amber-50 border-amber-200 text-amber-950", accent: "bg-amber-500", dot: "bg-amber-500" },
  rose: { card: "bg-rose-50 border-rose-200 text-rose-950", accent: "bg-rose-600", dot: "bg-rose-500" },
  violet: { card: "bg-violet-50 border-violet-200 text-violet-950", accent: "bg-violet-600", dot: "bg-violet-500" },
  cyan: { card: "bg-cyan-50 border-cyan-200 text-cyan-950", accent: "bg-cyan-600", dot: "bg-cyan-500" },
  lime: { card: "bg-lime-50 border-lime-200 text-lime-950", accent: "bg-lime-600", dot: "bg-lime-500" },
  orange: { card: "bg-orange-50 border-orange-200 text-orange-950", accent: "bg-orange-500", dot: "bg-orange-500" },
  fuchsia: { card: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-950", accent: "bg-fuchsia-600", dot: "bg-fuchsia-500" },
  teal: { card: "bg-teal-50 border-teal-200 text-teal-950", accent: "bg-teal-600", dot: "bg-teal-500" },
  indigo: { card: "bg-indigo-50 border-indigo-200 text-indigo-950", accent: "bg-indigo-600", dot: "bg-indigo-500" },
  stone: { card: "bg-stone-100 border-stone-300 text-stone-950", accent: "bg-stone-600", dot: "bg-stone-500" },
};
