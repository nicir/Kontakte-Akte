import { describe, expect, it } from "vitest";
import { addDaysIso, dayDiff, formatDate, parseIsoDate, relativeDay, todayIso } from "./format";
import { fold, uniqueByFold } from "./text";

describe("calendar dates are never shifted by time zones", () => {
  it("parses YYYY-MM-DD as local date", () => {
    const d = parseIsoDate("2026-06-15");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 15]);
    expect(todayIso(d)).toBe("2026-06-15");
  });
  it("adds days across DST and month ends", () => {
    expect(addDaysIso("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDaysIso("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayDiff("2026-03-30", "2026-03-28")).toBe(2);
  });
  it("formats German dates and relative days", () => {
    expect(formatDate("2026-03-15")).toBe("15. März 2026");
    expect(relativeDay("2026-03-15", "2026-03-15")).toBe("heute");
    expect(relativeDay("2026-03-14", "2026-03-15")).toBe("gestern");
    expect(relativeDay("2025-12-15", "2026-03-15")).toBe("vor 3 Monaten");
    expect(relativeDay(null)).toBe("noch nie");
  });
});

describe("text normalisation mirrors the backend", () => {
  it("folds case, whitespace and diacritics", () => {
    expect(fold("  Steuerrecht ")).toBe("steuerrecht");
    expect(fold("Müller")).toBe("muller");
    expect(fold("Straße")).toBe("strasse");
  });
  it("deduplicates equivalent values", () => {
    expect(uniqueByFold(["Steuerrecht", "steuerrecht", "Steuerrecht ", "Gesellschaftsrecht"])).toEqual([
      "Steuerrecht",
      "Gesellschaftsrecht",
    ]);
  });
});
