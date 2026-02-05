import menJumpersRaw from '@assets/men_jumpers_all.csv?raw';
import womenJumpersRaw from '@assets/women_jumpers_all.csv?raw';
import menTeamsRaw from '@assets/men_teams.csv?raw';
import womenTeamsRaw from '@assets/women_teams.csv?raw';
import menLimitsRaw from '@assets/men_limits.csv?raw';
import menWorldCupRaw from '@assets/men_world_cup.csv?raw';
import womenWorldCupRaw from '@assets/women_world_cup.csv?raw';
import { csvToObjects } from './parseCsv';

/** Z CSV: A_Skill, B_Skill są 1–100; dzielimy przez 10 i zapisujemy 1–10. Form w CSV 0–100 → w grze 0–10. Landing/bonus -3..3. */
function parseNum(
  s: string | undefined,
  defaultVal: number,
  min?: number,
  max?: number
): number {
  const n = parseInt(String(s ?? '').trim(), 10);
  if (Number.isNaN(n)) return defaultVal;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

export interface Jumper {
  country: string;
  name: string;
  surname: string;
  /** Skill małe skocznie (1–10, z CSV 1–100 / 10). */
  aSkill?: number;
  /** Skill duże skocznie (1–10, z CSV 1–100 / 10). */
  bSkill?: number;
  /** Lądowanie (-3..3). */
  landing?: number;
  /** Forma w grze 0–10 (w CSV kolumna Form jest 0–100, przy wczytywaniu dzielimy przez 10). */
  form?: number;
  /** Bonus w ważnych skokach (-3..3). */
  bonusImportantJumps?: number;
  /** Płeć – ustawiane przy wczytywaniu z women_jumpers_all.csv. */
  gender?: 'men' | 'women';
}

/** Limit skoczków na Predazzo. W Sapporo limity nie obowiązują. */
export interface CountryLimit {
  country: string;
  limit: number;
}

function optNum(
  row: Record<string, string>,
  key: string,
  defaultVal: number,
  min?: number,
  max?: number
): number | undefined {
  const s = row[key];
  if (s == null || String(s).trim() === '') return undefined;
  return parseNum(s, defaultVal, min, max);
}

/** Skille w CSV 1–100 → w grze 1–10 (dzielenie przez 10, clamp). */
function csvSkillTo1_10(raw: number): number {
  return Math.max(1, Math.min(10, raw / 10));
}

/** Forma w CSV 0–100 → w grze 0–10. Stosować przy każdym wczytywaniu Form z CSV. */
export function formCsvToGame(csvForm0_100: number): number {
  return Math.max(0, Math.min(10, csvForm0_100 / 10));
}

function toJumper(row: Record<string, string>, gender?: 'men' | 'women'): Jumper {
  const j: Jumper = {
    country: row.Country ?? '',
    name: row.Name ?? '',
    surname: row.Surname ?? '',
  };
  if (gender) j.gender = gender;
  const aRaw = optNum(row, 'A_Skill', 50, 1, 100);
  const bRaw = optNum(row, 'B_Skill', 50, 1, 100);
  const land = optNum(row, 'Landing', 0, -3, 3);
  const fRaw = optNum(row, 'Form', 50, 0, 100); // CSV 0–100
  const bonus = optNum(row, 'BonusImportantJumps', 0, -3, 3);
  if (aRaw != null) j.aSkill = csvSkillTo1_10(aRaw);
  if (bRaw != null) j.bSkill = csvSkillTo1_10(bRaw);
  if (land != null) j.landing = land;
  if (fRaw != null) j.form = formCsvToGame(fRaw);
  if (bonus != null) j.bonusImportantJumps = bonus;
  return j;
}

const toLimit = (row: Record<string, string>): CountryLimit => ({
  country: row.Country ?? '',
  limit: parseInt(row.Limit ?? '0', 10) || 0
});

let _menJumpers: Jumper[] | null = null;
let _menTeams: Jumper[] | null = null;
let _menLimits: CountryLimit[] | null = null;
let _worldCupOrderIds: string[] | null = null;
let _womenWorldCupOrderIds: string[] | null = null;

let _womenJumpers: Jumper[] | null = null;
let _womenTeams: Jumper[] | null = null;

function load(): void {
  if (_menJumpers) return;
  _menJumpers = csvToObjects(menJumpersRaw, (r) => toJumper(r));
  _womenJumpers = csvToObjects(womenJumpersRaw, (r) => toJumper(r, 'women'));
  const menTeamsRawParsed = csvToObjects(menTeamsRaw, (r) => toJumper(r));
  const menAll = _menJumpers;
  _menTeams = menTeamsRawParsed.map((mt) => {
    const full = menAll?.find(
      (m) => m.country === mt.country && m.name === mt.name && m.surname === mt.surname
    );
    return full ?? mt;
  });
  const womenTeamsRawParsed = csvToObjects(womenTeamsRaw, (r) => toJumper(r, 'women'));
  const womenAll = _womenJumpers;
  _womenTeams = womenTeamsRawParsed.map((wt) => {
    const full = womenAll?.find(
      (w) => w.country === wt.country && w.name === wt.name && w.surname === wt.surname
    );
    return full ?? wt;
  });
  _menLimits = csvToObjects(menLimitsRaw, toLimit);
}

function loadWorldCup(): void {
  if (_worldCupOrderIds) return;
  const rows = csvToObjects(menWorldCupRaw, (r) => ({
    position: parseInt(r.Position ?? '0', 10),
    country: r.Country ?? '',
    name: r.Name ?? '',
    surname: r.Surname ?? '',
  })).filter((x) => x.position > 0);
  rows.sort((a, b) => a.position - b.position);
  _worldCupOrderIds = rows.map(
    (x) => `${x.country}-${x.name}-${x.surname}`.replace(/\s+/g, '-')
  );
}

/** Kolejność PŚ (generalka) – pełna lista z men_world_cup.csv. Pozycja 1 = index 0. */
export function getWorldCupOrderAll(): string[] {
  loadWorldCup();
  return _worldCupOrderIds ?? [];
}

function loadWomenWorldCup(): void {
  if (_womenWorldCupOrderIds) return;
  const rows = csvToObjects(womenWorldCupRaw, (r) => ({
    position: parseInt(r.Position ?? '0', 10),
    country: r.Country ?? '',
    name: r.Name ?? '',
    surname: r.Surname ?? '',
  })).filter((x) => x.position > 0);
  rows.sort((a, b) => a.position - b.position);
  _womenWorldCupOrderIds = rows.map(
    (x) => `${x.country}-${x.name}-${x.surname}`.replace(/\s+/g, '-')
  );
}

/** Kolejność PŚ kobiet – pełna lista z women_world_cup.csv. Pozycja 1 = index 0. */
export function getWomenWorldCupOrderAll(): string[] {
  loadWomenWorldCup();
  return _womenWorldCupOrderIds ?? [];
}

export function getMenJumpersAll(): Jumper[] {
  load();
  return _menJumpers ?? [];
}

/** Skoczkinie z women_jumpers_all.csv (kolumny A_Skill, B_Skill, Form itd. opcjonalne – uzupełnij gdy gotowe). */
export function getWomenJumpersAll(): Jumper[] {
  load();
  return _womenJumpers ?? [];
}

/** Prawdziwe powołania męskich kadr na Predazzo (men_teams.csv). */
export function getMenTeams(): Jumper[] {
  load();
  return _menTeams ?? [];
}

/** Prawdziwe powołania żeńskich kadr na Predazzo (women_teams.csv). */
export function getWomenTeams(): Jumper[] {
  load();
  return _womenTeams ?? [];
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
  KOR: 'KR',
  NOR: 'NO',
  POL: 'PL',
  ROU: 'RO',
  SLO: 'SI',
  SUI: 'CH',
  SVK: 'SK',
  SWE: 'SE',
  TUR: 'TR',
  UKR: 'UA',
  USA: 'US'
};

/** Nazwa kraju po polsku dla kodu ISO 3166-1 alpha-3. */
export const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  AUT: 'Austria',
  BUL: 'Bułgaria',
  CHN: 'Chiny',
  CAN: 'Kanada',
  CZE: 'Czechy',
  EST: 'Estonia',
  FIN: 'Finlandia',
  FRA: 'Francja',
  GER: 'Niemcy',
  ITA: 'Włochy',
  JPN: 'Japonia',
  KAZ: 'Kazachstan',
  KOR: 'Korea Południowa',
  NOR: 'Norwegia',
  POL: 'Polska',
  ROU: 'Rumunia',
  SLO: 'Słowenia',
  SUI: 'Szwajcaria',
  SVK: 'Słowacja',
  SWE: 'Szwecja',
  TUR: 'Turcja',
  UKR: 'Ukraina',
  USA: 'USA'
};

/** Zwraca nazwę kraju dla kodu (np. POL → Polska), lub kod gdy brak mapowania. */
export function countryCodeToName(code3: string): string {
  return COUNTRY_CODE_TO_NAME[code3] ?? code3;
}

/** Zwraca emoji flagi dla kodu kraju (np. AUT → 🇦🇹). */
export function countryToFlag(code3: string): string {
  const a2 = COUNTRY_TO_ALPHA2[code3] ?? code3.slice(0, 2);
  return [...a2].map((c) => String.fromCodePoint(0x1f1e6 + c.toUpperCase().charCodeAt(0) - 65)).join('');
}
