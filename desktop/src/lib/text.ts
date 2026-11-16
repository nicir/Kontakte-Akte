/** Same normalisation idea as the backend: case-, whitespace- and diacritic-insensitive. */
export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanValue(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function uniqueByFold(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanValue(raw);
    const key = fold(value);
    if (value && !seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}
