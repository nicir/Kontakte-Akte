/**
 * Sequential single-hue (orange) scale for the choropleth.
 *
 * Contact counts are usually very unevenly distributed (many countries with 1–2,
 * a few with dozens), so class breaks are spaced logarithmically. Up to five
 * classes; 0 contacts is a neutral gray, never part of the orange ramp.
 */
export const NO_DATA_COLOR = "#F3F4F6";
const RAMP = ["#FED7AA", "#FDBA74", "#FB923C", "#EA580C", "#9A3412"];

export interface ScaleClass {
  min: number;
  max: number;
  color: string;
}

export function buildClasses(maxCount: number): ScaleClass[] {
  if (maxCount <= 0) return [];
  const classCount = Math.min(RAMP.length, maxCount);
  const bounds: number[] = [];
  for (let i = 1; i <= classCount; i++) {
    const upper = Math.round(Math.exp((Math.log(maxCount) * i) / classCount));
    bounds.push(Math.max(upper, (bounds[bounds.length - 1] ?? 0) + 1));
  }
  bounds[bounds.length - 1] = maxCount;
  // Spread the classes over the full ramp so the highest class is always the darkest color.
  return bounds.map((upper, i) => ({
    min: i === 0 ? 1 : bounds[i - 1]! + 1,
    max: upper,
    color: RAMP[classCount === 1 ? RAMP.length - 2 : Math.round((i * (RAMP.length - 1)) / (classCount - 1))]!,
  }));
}

export function colorFor(count: number, classes: ScaleClass[]): string {
  if (count <= 0) return NO_DATA_COLOR;
  return classes.find((c) => count <= c.max)?.color ?? classes[classes.length - 1]?.color ?? NO_DATA_COLOR;
}

export function classLabel(c: ScaleClass): string {
  return c.min === c.max ? `${c.min}` : `${c.min}–${c.max}`;
}
