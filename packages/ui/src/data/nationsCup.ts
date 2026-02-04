import menNationsCupRaw from '@assets/men_nations_cup.csv?raw';
import womenNationsCupRaw from '@assets/women_nations_cup.csv?raw';
import { csvToObjects } from './parseCsv';

interface NationsCupRow {
  country: string;
  points: number;
}

function parseNationsCup(raw: string): NationsCupRow[] {
  return csvToObjects(raw, (row) => ({
    country: row.Country ?? '',
    points: parseInt(row.Points ?? '0', 10) || 0,
  })).filter((r) => r.country);
}

let _menRows: NationsCupRow[] | null = null;
let _womenRows: NationsCupRow[] | null = null;

function load(): void {
  if (!_menRows) _menRows = parseNationsCup(menNationsCupRaw);
  if (!_womenRows) _womenRows = parseNationsCup(womenNationsCupRaw);
}

/** Map country -> position (1 = najlepszy). */
function toPositionMap(rows: NationsCupRow[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((row, idx) => {
    map.set(row.country, idx + 1);
  });
  return map;
}

/** Męski Puchar Narodów: pozycja (1 = najlepszy). */
export function getMenNationsCupRanking(): Map<string, number> {
  load();
  return toPositionMap(_menRows ?? []);
}

/** Żeński Puchar Narodów: pozycja (1 = najlepszy). */
export function getWomenNationsCupRanking(): Map<string, number> {
  load();
  return toPositionMap(_womenRows ?? []);
}

/** Mieszany ranking: suma punktów męskich + żeńskich, pozycja (1 = najlepszy). */
export function getMixedNationsCupRanking(): Map<string, number> {
  load();
  const men = _menRows ?? [];
  const women = _womenRows ?? [];
  const points = new Map<string, number>();
  men.forEach((row) => points.set(row.country, (points.get(row.country) ?? 0) + row.points));
  women.forEach((row) => points.set(row.country, (points.get(row.country) ?? 0) + row.points));
  const sorted = [...points.entries()].sort((a, b) => b[1] - a[1]);
  const map = new Map<string, number>();
  sorted.forEach(([country], idx) => {
    map.set(country, idx + 1);
  });
  return map;
}
