/**
 * Prosty parser CSV (bez cudzysłowów, przecinek jako separator).
 */
export function parseCsv(raw: string): string[][] {
  const lines = raw.trim().split(/\r?\n/);
  return lines.map((line) => line.split(',').map((cell) => cell.trim()));
}

export function csvToObjects<T>(
  raw: string,
  map: (row: Record<string, string>) => T
): T[] {
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];
  const headers = rows[0]!;
  const result: T[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = rows[i]![j] ?? '';
    });
    result.push(map(row));
  }
  return result;
}
