/** Date helpers. Calendar dates (YYYY-MM-DD) are never converted through UTC. */

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + days);
  return todayIso(date);
}

/** Parse YYYY-MM-DD as a *local* calendar date (no timezone shift). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return dateFmt.format(parseIsoDate(iso));
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return shortDateFmt.format(parseIsoDate(iso));
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "–";
  return dateTimeFmt.format(new Date(iso));
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return `${time.slice(0, 5)} Uhr`;
}

/** Whole calendar days from `today` to `iso` (negative = past). */
export function dayDiff(iso: string, today: string = todayIso()): number {
  const a = parseIsoDate(today).getTime();
  const b = parseIsoDate(iso).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function relativeDay(iso: string | null | undefined, today: string = todayIso()): string {
  if (!iso) return "noch nie";
  const diff = dayDiff(iso, today);
  if (diff === 0) return "heute";
  if (diff === -1) return "gestern";
  if (diff === 1) return "morgen";
  const abs = Math.abs(diff);
  let amount: string;
  if (abs < 14) amount = `${abs} Tagen`;
  else if (abs < 60) amount = `${Math.round(abs / 7)} Wochen`;
  else if (abs < 365) amount = `${Math.round(abs / 30)} Monaten`;
  else {
    const years = Math.round(abs / 365);
    amount = years === 1 ? "einem Jahr" : `${years} Jahren`;
  }
  return diff < 0 ? `vor ${amount}` : `in ${amount}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("de-DE")} ${n === 1 ? one : many}`;
}
