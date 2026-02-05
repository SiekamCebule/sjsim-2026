/**
 * Lista startowa treningów i serii próbnych indywidualnych.
 * Zawodnicy mogą odpuszczać treningi/serie próbne wg heurystyk (forma, top, Japończycy, itd.).
 */

import type { Jumper } from './jumpersData';
import type { ScheduleItem } from './predazzoSchedule';
import { EVENT_SKIP_HINTS, PREDAZZO_SCHEDULE } from './predazzoSchedule';
import { getMenTeams, getWomenTeams, getWorldCupOrderAll, getWomenWorldCupOrderAll } from './jumpersData';
import type { EventResultsSummary } from './eventResults';

export interface SkipDecisionContext {
  event: ScheduleItem;
  roster: Jumper[];
  eventResults?: Record<string, EventResultsSummary>;
  /** 1..3 (jak w UI); jeśli brak — przyjmujemy 1. */
  trainingSeriesIndex?: number;
  schedule?: ScheduleItem[];
}

export function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

function jumperId(j: Jumper): string {
  return `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
}

/** Kolejność startowa: PŚ, potem alfabetycznie. */
function startOrderKey(j: Jumper, wcOrder: string[]): number {
  const id = jumperId(j);
  const idx = wcOrder.indexOf(id);
  return idx >= 0 ? idx : wcOrder.length + 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashToUnit(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

function skillForHill(jumper: Jumper, hill: ScheduleItem['hill']): number {
  const small = jumper.aSkill ?? 5;
  const big = jumper.bSkill ?? 5;
  return hill === 'HS107' ? small : hill === 'HS141' ? big : (small + big) / 2;
}

function qualityForHill(jumper: Jumper, hill: ScheduleItem['hill']): number {
  const form = jumper.form ?? 5;
  return (skillForHill(jumper, hill) + form) / 2;
}

const SPECIAL_SKIP_BOOSTS: Record<string, number> = {
  'NOR:Halvor Egner:Granerud': 0.12,
  'SLO:Domen:Prevc': 0.12,
  'POL:Kamil:Stoch': 0.18,
  'SUI:Simon:Ammann': 0.18,
  'JPN:Noriaki:Kasai': 0.26,
  'AUT:Manuel:Fettner': 0.1,
  'POL:Piotr:Żyła': 0.18,
  'FIN:Niko:Kytosaho': 0.1,
  'CZE:Roman:Koudelka': 0.18,
  'AUT:Jan:Hoerl': 0.12,
};

const TRAINING_SKIP_BASE: Record<string, number[]> = {
  '1': [0.02, 0.03, 0.04],
  '2': [0.02, 0.03, 0.04],
  '3': [0.1, 0.16, 0.28],
  '6': [0.55, 0.66, 0.78],
  '7': [0.06, 0.18, 0.3],
  '12': [0.03, 0.04, 0.05],
  '13': [0.03, 0.04, 0.05],
  '14': [0.1, 0.18, 0.25],
  '15': [0.1, 0.18, 0.25],
  '18': [0.6, 0.75, 0.85],
};

const TRIAL_SKIP_BASE: Record<string, number> = {
  '4': 0.03,
  '8': 0.04,
  '10': 0.04,
  '16': 0.04,
  '19': 0.03,
  '21': 0.02,
};

const DAY_SKIP_CHANCE: Record<string, number> = {
  '7': 0.06,
  '18': 0.3,
};

function baseSkipChance(event: ScheduleItem, seriesIndex: number): number {
  if (event.type === 'trial') {
    return TRIAL_SKIP_BASE[event.id] ?? 0.03;
  }
  const base = TRAINING_SKIP_BASE[event.id];
  if (base) return base[Math.min(seriesIndex, base.length - 1)] ?? base[0] ?? 0.05;
  const hint = EVENT_SKIP_HINTS[event.id];
  if (hint) {
    const baseHint = hint === 'most' ? 0.55 : hint === 'many' ? 0.3 : 0.15;
    return clamp(baseHint + seriesIndex * 0.05, 0.05, 0.85);
  }
  return clamp(0.05 + seriesIndex * 0.03, 0.02, 0.25);
}

/**
 * Zwraca indeks treningu na danej skoczni: 0 = pierwszy, 1 = drugi, 2 = trzeci, 3+ = kolejne.
 * Na pierwszych 3 treningach na skoczni praktycznie się nie rezygnuje.
 */
function getTrainingIndexOnHill(event: ScheduleItem, schedule: ScheduleItem[]): number {
  if (event.type !== 'training' || !event.hill) return 0;
  const idx = schedule.findIndex((item) => item.id === event.id);
  if (idx < 0) return 0;
  let count = 0;
  for (let i = 0; i < idx; i += 1) {
    const item = schedule[i]!;
    if (item.type === 'training' && item.hill === event.hill) count += 1;
  }
  return count;
}

/**
 * Zwraca indeks serii treningowej na danej skoczni i płci (0 = pierwsza seria).
 * Liczymy po 3 serie na event treningowy (HS107/HS141).
 */
function getTrainingSeriesIndexOnHill(
  event: ScheduleItem,
  schedule: ScheduleItem[],
  seriesIndex0: number
): number {
  if (event.type !== 'training' || !event.hill) return 0;
  const idx = schedule.findIndex((item) => item.id === event.id);
  if (idx < 0) return seriesIndex0;
  let seriesCount = 0;
  for (let i = 0; i < idx; i += 1) {
    const item = schedule[i]!;
    if (item.type === 'training' && item.hill === event.hill && item.gender === event.gender) {
      seriesCount += item.trainingSeries ?? 3;
    }
  }
  return seriesCount + seriesIndex0;
}

function getPreviousTrainingEvent(
  event: ScheduleItem,
  schedule: ScheduleItem[],
  gender: ScheduleItem['gender']
): ScheduleItem | null {
  const idx = schedule.findIndex((item) => item.id === event.id);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const candidate = schedule[i];
    if (candidate.type === 'training' && candidate.gender === gender && candidate.hill === event.hill) {
      return candidate;
    }
  }
  return null;
}

function getRelevantTrainingResults(
  event: ScheduleItem,
  seriesIdx: number,
  currentSeriesIndex0: number,
  eventResults: Record<string, EventResultsSummary> | undefined,
  gender: ScheduleItem['gender'],
  schedule: ScheduleItem[]
): EventResultsSummary | null {
  if (!eventResults) return null;
  if (event.type === 'training' && seriesIdx === currentSeriesIndex0 && seriesIdx > 0) {
    return eventResults[event.id] ?? null;
  }
  const prev = getPreviousTrainingEvent(event, schedule, gender);
  return prev ? eventResults[prev.id] ?? null : null;
}

function performanceSkipBoost(
  jumper: Jumper,
  roster: Jumper[],
  results: EventResultsSummary | null,
  hill: ScheduleItem['hill']
): number {
  if (!results) return 0;
  const standing = results.standings.find((s) => s.jumperId === jumperId(jumper));
  if (!standing) return 0;
  const total = Math.max(1, results.standings.length);
  let boost = 0;
  const topStrict = Math.max(3, Math.ceil(total * 0.05));
  const topWide = Math.max(6, Math.ceil(total * 0.12));
  if (standing.rank <= topStrict) boost += 0.14;
  else if (standing.rank <= topWide) boost += 0.1;

  const expected = roster
    .slice()
    .sort((a, b) => qualityForHill(b, hill) - qualityForHill(a, hill))
    .findIndex((j) => jumperId(j) === jumperId(jumper)) + 1;
  const expectedRank = expected > 0 ? expected : total;
  const gap = expectedRank - standing.rank;
  if (gap >= Math.max(6, Math.ceil(total * 0.12))) boost += 0.1;
  return boost;
}

function getRosterFromCallups(event: ScheduleItem, allCallups?: Record<string, Jumper[]>): Jumper[] {
  const gender = event.gender;
  if (gender === 'mixed') return [];
  const menFromCallups = Object.values(allCallups ?? {}).flat();
  return gender === 'men'
    ? menFromCallups.length > 0
      ? menFromCallups
      : getMenTeams()
    : getWomenTeams();
}

function isHighSkillAndForm(jumper: Jumper, hill: ScheduleItem['hill']): boolean {
  const skill = skillForHill(jumper, hill);
  const form = jumper.form ?? 5;
  return skill >= 8.2 && form >= 7.0;
}

function isVeryHighSkillAndForm(jumper: Jumper, hill: ScheduleItem['hill']): boolean {
  const skill = skillForHill(jumper, hill);
  const form = jumper.form ?? 5;
  return skill >= 9 && form >= 8;
}

function menSpecialBoost(jumper: Jumper): number {
  if (jumper.gender === 'women') return 0;
  const key = jumperKey(jumper);
  let boost = SPECIAL_SKIP_BOOSTS[key] ?? 0;
  if (jumper.country === 'JPN') boost += 0.12;
  return boost;
}

function getSeriesIndex0(seriesIndex?: number): number {
  if (!seriesIndex) return 0;
  return Math.max(0, seriesIndex - 1);
}

function buildBattleMap(roster: Jumper[], hill: ScheduleItem['hill']): Set<string> {
  const byCountry = new Map<string, Jumper[]>();
  roster.forEach((j) => {
    if (j.gender === 'women') return;
    const list = byCountry.get(j.country) ?? [];
    list.push(j);
    byCountry.set(j.country, list);
  });
  const battle = new Set<string>();
  byCountry.forEach((list) => {
    if (list.length < 3) return;
    const sorted = list.slice().sort((a, b) => qualityForHill(b, hill) - qualityForHill(a, hill));
    const q2 = qualityForHill(sorted[1]!, hill);
    const q3 = qualityForHill(sorted[2]!, hill);
    if (q2 - q3 <= 0.25) {
      battle.add(jumperKey(sorted[0]!));
      battle.add(jumperKey(sorted[1]!));
      battle.add(jumperKey(sorted[2]!));
    }
  });
  return battle;
}

/**
 * Zwraca zestaw skoczków, którzy odpuszczają trening/serię próbną.
 */
export function getSkippedJumperKeys({
  event,
  roster,
  eventResults,
  trainingSeriesIndex,
  schedule = PREDAZZO_SCHEDULE,
}: SkipDecisionContext): Set<string> {
  if (event.type !== 'training' && event.type !== 'trial') return new Set();
  const seriesIndex0 = getSeriesIndex0(trainingSeriesIndex);
  const skipped = new Set<string>();
  const trainingIndexOnHill = getTrainingIndexOnHill(event, schedule);
  const trainingSeriesIndexOnHill = getTrainingSeriesIndexOnHill(event, schedule, seriesIndex0);
  const isFirstThreeTrainingsOnHill = event.type === 'training' && trainingIndexOnHill < 3;
  const isFirstThreeSeriesOnHill = event.type === 'training' && trainingSeriesIndexOnHill < 3;

  const battleMap = event.id === '18' ? buildBattleMap(roster, event.hill) : new Set<string>();
  const eligibleCountries = new Set<string>();
  if (event.id === '18') {
    roster.forEach((j) => {
      if (j.gender === 'women') return;
      const count = roster.filter((m) => m.country === j.country && m.gender !== 'women').length;
      if (count >= 2) eligibleCountries.add(j.country);
    });
  }

  roster.forEach((jumper) => {
    const key = jumperKey(jumper);
    if (isFirstThreeTrainingsOnHill || isFirstThreeSeriesOnHill) {
      return;
    }
    if (event.id === '18') {
      if (!eligibleCountries.has(jumper.country) || jumper.gender === 'women') {
        skipped.add(key);
        return;
      }
      if (battleMap.has(key)) {
        return;
      }
    }

    const daySkipChance = DAY_SKIP_CHANCE[event.id] ?? 0;
    if (daySkipChance > 0 && hashToUnit(`${event.id}:${key}:day`) < daySkipChance) {
      skipped.add(key);
      return;
    }

    const shouldSkipSeries = (seriesIdx: number): boolean => {
      let chance = baseSkipChance(event, seriesIdx);
      chance += menSpecialBoost(jumper);
      if (isHighSkillAndForm(jumper, event.hill)) chance += 0.12;
      if (isVeryHighSkillAndForm(jumper, event.hill)) chance += 0.08;
      const gender = event.gender === 'mixed' ? (jumper.gender ?? 'men') : event.gender;
      const relevantRoster = roster.filter((j) => (j.gender ?? 'men') === gender);
      const results = getRelevantTrainingResults(event, seriesIdx, seriesIndex0, eventResults, gender, schedule);
      chance += performanceSkipBoost(jumper, relevantRoster, results, event.hill);

      if (event.id === '18') {
        const quality = qualityForHill(jumper, event.hill);
        const form = jumper.form ?? 5;
        chance += (quality - 6.5) * 0.08;
        if (form <= 4.5) chance -= 0.12;
        if (quality <= 5.8) chance -= 0.1;
      }

      chance = clamp(chance, 0, 0.95);
      return hashToUnit(`${event.id}:${seriesIdx}:${key}:skip`) < chance;
    };

    if (event.type === 'training' && seriesIndex0 > 0) {
      for (let i = 0; i < seriesIndex0; i += 1) {
        if (shouldSkipSeries(i)) {
          skipped.add(key);
          return;
        }
      }
    }

    if (shouldSkipSeries(event.type === 'training' ? seriesIndex0 : 0)) {
      skipped.add(key);
    }
  });

  return skipped;
}

/**
 * Pełna lista startowa dla treningu/serii próbnej indywidualnej.
 * @param event — event z harmonogramu (training lub trial, gender men/women)
 * @param allCallups — powołania kadr (dla mężczyzn); dla kobiet używamy women teams
 */
export function getStartListForTrainingOrTrial(
  event: ScheduleItem,
  allCallups?: Record<string, Jumper[]>,
  eventResults?: Record<string, EventResultsSummary>,
  trainingSeriesIndex?: number
): Jumper[] {
  const gender = event.gender;
  if (gender === 'mixed') return [];

  const callups = getRosterFromCallups(event, allCallups);
  const skipped = getSkippedJumperKeys({ event, roster: callups, eventResults, trainingSeriesIndex });
  const filtered = callups.filter((j) => !skipped.has(jumperKey(j)));

  const wcOrder = gender === 'men' ? getWorldCupOrderAll() : gender === 'women' ? getWomenWorldCupOrderAll() : [];
  filtered.sort((a, b) => {
    if (gender === 'men' || gender === 'women') {
      return startOrderKey(a, wcOrder) - startOrderKey(b, wcOrder);
    }
    return (
      a.country.localeCompare(b.country) ||
      a.surname.localeCompare(b.surname) ||
      a.name.localeCompare(b.name)
    );
  });

  return filtered;
}
