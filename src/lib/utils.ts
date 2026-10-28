import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(sec: number | null | undefined) {
  if (sec == null) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function formatTalkTime(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export function formatMoney(n: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: opts.compact && n >= 10000 ? "compact" : "standard",
  }).format(n);
}

export function formatPct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Text colour for a scorecard percentage. */
export function pctTone(p: number | null) {
  if (p == null) return "text-ink-4";
  return p >= 0.9 ? "text-green-ink" : p >= 0.75 ? "text-orange-ink" : "text-red-ink";
}
