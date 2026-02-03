import menJumpersRaw from '@assets/men_jumpers_all.csv?raw';
import menTeamsRaw from '@assets/men_teams.csv?raw';
import menLimitsRaw from '@assets/men_limits.csv?raw';
import { csvToObjects } from './parseCsv';

export interface Jumper {
  country: string;
  name: string;
  surname: string;
}

export interface CountryLimit {
  country: string;
  limit: number;
}

const toJumper = (row: Record<string, string>): Jumper => ({
  country: row.Country ?? '',
  name: row.Name ?? '',
  surname: row.Surname ?? ''
});

const toLimit = (row: Record<string, string>): CountryLimit => ({
  country: row.Country ?? '',
  limit: parseInt(row.Limit ?? '0', 10) || 0
});

let _menJumpers: Jumper[] | null = null;
let _menTeams: Jumper[] | null = null;
let _menLimits: CountryLimit[] | null = null;

function load(): void {
  if (_menJumpers) return;
  _menJumpers = csvToObjects(menJumpersRaw, toJumper);
  _menTeams = csvToObjects(menTeamsRaw, toJumper);
  _menLimits = csvToObjects(menLimitsRaw, toLimit);
}

export function getMenJumpersAll(): Jumper[] {
  load();
  return _menJumpers ?? [];
}

/** Prawdziwe powołania męskich kadr na Predazzo (men_teams.csv). */
export function getMenTeams(): Jumper[] {
  load();
  return _menTeams ?? [];
}

/** @deprecated Użyj getMenTeams. Zachowane dla kompatybilności. */
export function getRealMenTeam(): Jumper[] {
  return getMenTeams();
}

export function getMenLimits(): CountryLimit[] {
  load();
  return _menLimits ?? [];
}

export function getJumpersByCountry(country: string): Jumper[] {
  return getMenJumpersAll().filter((j) => j.country === country);
}

/** Prawdziwy skład męskiej kadry na Predazzo dla danego kraju. */
export function getRealRosterForCountry(country: string): Jumper[] {
  return getMenTeams().filter((j) => j.country === country);
}

export function getLimitForCountry(country: string): number {
  const limit = getMenLimits().find((l) => l.country === country);
  return limit?.limit ?? 0;
}

export function getMenCountries(): string[] {
  const countries = getMenLimits().map((l) => l.country);
  return [...new Set(countries)].sort();
}

/** Map ISO 3166-1 alpha-3 do alpha-2 (dla flag emoji). */
const COUNTRY_TO_ALPHA2: Record<string, string> = {
  AUT: 'AT',
  BUL: 'BG',
  CHN: 'CN',
  CAN: 'CA',
  CZE: 'CZ',
  EST: 'EE',
  FIN: 'FI',
  FRA: 'FR',
  GER: 'DE',
  ITA: 'IT',
  JPN: 'JP',
  KAZ: 'KZ',
  NOR: 'NO',
  POL: 'PL',
  ROU: 'RO',
  SLO: 'SI',
  SUI: 'CH',
  SVK: 'SK',
  TUR: 'TR',
  UKR: 'UA',
  USA: 'US'
};

/** Zwraca emoji flagi dla kodu kraju (np. AUT → 🇦🇹). */
export function countryToFlag(code3: string): string {
  const a2 = COUNTRY_TO_ALPHA2[code3] ?? code3.slice(0, 2);
  return [...a2].map((c) => String.fromCodePoint(0x1f1e6 + c.toUpperCase().charCodeAt(0) - 65)).join('');
}
