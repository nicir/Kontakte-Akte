import { describe, expect, it } from "vitest";
import { NO_DATA_COLOR, buildClasses, classLabel, colorFor } from "./colorScale";

describe("choropleth scale", () => {
  it("has no classes without data", () => {
    expect(buildClasses(0)).toEqual([]);
    expect(colorFor(0, [])).toBe(NO_DATA_COLOR);
  });

  it("uses one class per count for small maxima", () => {
    const classes = buildClasses(3);
    expect(classes.map(classLabel)).toEqual(["1", "2", "3"]);
    expect(colorFor(3, classes)).not.toBe(colorFor(1, classes));
  });

  it("covers 1..max contiguously and gets darker with higher counts", () => {
    for (const max of [1, 2, 5, 7, 12, 40, 250]) {
      const classes = buildClasses(max);
      expect(classes[0]!.min).toBe(1);
      expect(classes[classes.length - 1]!.max).toBe(max);
      for (let i = 1; i < classes.length; i++) expect(classes[i]!.min).toBe(classes[i - 1]!.max + 1);
      expect(classes.length).toBeLessThanOrEqual(5);
    }
    const classes = buildClasses(100);
    expect(colorFor(100, classes)).toBe("#9A3412");
    expect(colorFor(1, classes)).toBe("#FED7AA");
  });

  it("log spacing keeps small counts distinguishable when one country dominates", () => {
    const classes = buildClasses(100);
    expect(colorFor(1, classes)).not.toBe(colorFor(5, classes));
  });

  it("zero is gray, never orange", () => {
    expect(colorFor(0, buildClasses(10))).toBe(NO_DATA_COLOR);
  });
});
