import { useState, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import type { JSX } from 'react';
import menuBg from '@assets/predazzo_hq.jpeg';
import {
  getNextEventByProgress,
  getNextEventWeather,
  getWeatherConditionLabel,
  isEventCompleted,
  isSnowyCondition,
  type ScheduleItem,
  type NextEventWeather,
} from '../data/predazzoSchedule';
import { WEATHER_ICONS } from '../data/weatherIcons';
import { countryToFlag, countryCodeToName, type Jumper } from '../data/jumpersData';
import type { GameDataSnapshot } from '../data/gameDataSnapshot';
import {
  resolveMenTeams,
  resolveWomenTeams,
  resolveMenJumpers,
  resolveWomenJumpers,
  resolveMenWorldCupOrder,
  resolveSchedule,
} from '../data/gameDataSnapshot';
import type { ArchiveEntry, ArchiveJumpResult, PredazzoArchiveEntry } from '../data/archiveTypes';
import { isPredazzoEntry } from '../data/archiveTypes';
import { HILL_PARAMS, type HillScoringParams } from '@sjsim/core';
import type { JuryBravery } from '@sjsim/core';
import type { GameConfigState } from './GameConfig';
import { CompetitionPreviewDialog } from './CompetitionPreviewDialog';
import { TeamSelectionDialog } from './TeamSelectionDialog';
import type { EventResultsSummary, TeamEventStanding } from '../data/eventResults';
import { buildMixedTeams, buildTeamPairs } from '../data/teamSelection';
import './predazzo-dashboard.css';

interface PredazzoDashboardProps {
  config?: GameConfigState | null;
  gameData?: GameDataSnapshot | null;
  onBack: () => void;
  onGoToNextEvent: (payload: {
    event: ScheduleItem;
    participating?: Jumper[];
    autoBar?: boolean;
    juryBravery?: JuryBravery;
    weather?: NextEventWeather;
    teamLineups?: Record<string, Jumper[]>;
    trainingSeriesIndex?: number;
  }) => void;
  completedEventIds: string[];
  trainingBlockProgress: Record<string, number>;
  skipIntro?: boolean;
  /** Czy pokazywać efekt śniegu przy pogodzie śnieżnej (domyślnie true). */
  snowEnabled?: boolean;
  eventResults?: Record<string, EventResultsSummary>;
  archiveEntries?: ArchiveEntry[];
  showFinalDialog?: boolean;
  onCloseFinalDialog?: () => void;
}

type CornerEntry =
  | { kind: 'jumper'; label: string; jumper: Jumper }
  | { kind: 'country'; label: string; country: string; duo: Jumper[] };

interface PerformanceStats {
  performance: number;
  events: number;
  top10Rate: number;
}

const TOP10_CUTOFF = 10;
const DARK_HORSE_EXCLUDE_TOP = 8;
const DARK_HORSE_MIN_TOP10_RATE = 0.25;
const DISAPPOINTMENT_TOP_WC = 20;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function baseJumperScore(jumper: Jumper): number {
  const aSkill = jumper.aSkill ?? jumper.bSkill ?? 5;
  const bSkill = jumper.bSkill ?? jumper.aSkill ?? 5;
  const skillAvg = (aSkill + bSkill) / 2;
  const form = jumper.form ?? 5;
  const skillScore = clamp01(skillAvg / 10);
  const formScore = clamp01(form / 10);
  return clamp01(skillScore * 0.75 + formScore * 0.25);
}

/** Dark horse: 55% formy, 45% skillScore. */
function darkHorseBaseScore(jumper: Jumper): number {
  const aSkill = jumper.aSkill ?? jumper.bSkill ?? 5;
  const bSkill = jumper.bSkill ?? jumper.aSkill ?? 5;
  const skillAvg = (aSkill + bSkill) / 2;
  const form = jumper.form ?? 5;
  const skillScore = clamp01(skillAvg / 10);
  const formScore = clamp01(form / 10);
  return clamp01(skillScore * 0.4 + formScore * 0.65);
}

function buildPerformanceScores(
  eventResults: Record<string, EventResultsSummary> | undefined,
  schedule: ScheduleItem[],
  filterEventIds?: Set<string>
): Map<string, PerformanceStats> {
  const order = new Map(schedule.map((item, idx) => [item.id, idx]));
  const summaries = Object.values(eventResults ?? {})
    .filter((event) => event.gender === 'men')
    .filter((event) => event.type === 'training' || event.type === 'trial' || event.type === 'individual' || event.type === 'team_men_pairs')
    .filter((event) => (filterEventIds ? filterEventIds.has(event.eventId) : true))
    .sort((a, b) => (order.get(a.eventId) ?? 0) - (order.get(b.eventId) ?? 0));

  const byJumper = new Map<string, { score: number; weight: number; events: number; top10: number }>();

  summaries.forEach((event, idx) => {
    const typeWeight =
      event.type === 'training' ? 0.4 :
        event.type === 'trial' ? 0.6 :
          event.type === 'individual' ? 1.2 :
            0.9;
    const recencyWeight = 1 + idx * 0.1;
    const weight = typeWeight * recencyWeight;
    const total = Math.max(1, event.standings.length);
    event.standings.forEach((standing) => {
      const rankScore = (total - standing.rank + 1) / total;
      const current = byJumper.get(standing.jumperId) ?? { score: 0, weight: 0, events: 0, top10: 0 };
      current.score += rankScore * weight;
      current.weight += weight;
      current.events += 1;
      if (standing.rank <= TOP10_CUTOFF) current.top10 += 1;
      byJumper.set(standing.jumperId, current);
    });
  });

  const scores = new Map<string, PerformanceStats>();
  byJumper.forEach((value, id) => {
    const performance = value.weight > 0 ? value.score / value.weight : 0;
    const top10Rate = value.events > 0 ? value.top10 / value.events : 0;
    scores.set(id, { performance, events: value.events, top10Rate });
  });
  return scores;
}

function jumperId(j: Jumper): string {
  return `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
}

function resolveMenEventIds(schedule: ScheduleItem[]): {
  hs107TrainingIds: string[];
  hs107TrialId: string | null;
  hs107IndividualId: string | null;
  hs141TrainingIds: string[];
  hs141TrialId: string | null;
  hs141IndividualId: string | null;
  menPairsTrialId: string | null;
  menPairsCompetitionId: string | null;
} {
  const order = new Map(schedule.map((item, idx) => [item.id, idx]));
  const hs107TrainingIds = schedule
    .filter((item) => item.gender === 'men' && item.hill === 'HS107' && item.type === 'training')
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((item) => item.id);
  const hs107TrialId = schedule.find((item) => item.gender === 'men' && item.hill === 'HS107' && item.type === 'trial')?.id ?? null;
  const hs107IndividualId = schedule.find((item) => item.gender === 'men' && item.hill === 'HS107' && item.type === 'individual')?.id ?? null;

  const hs141TrainingIds = schedule
    .filter((item) => item.gender === 'men' && item.hill === 'HS141' && item.type === 'training')
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((item) => item.id);
  const hs141IndividualId = schedule.find((item) => item.gender === 'men' && item.hill === 'HS141' && item.type === 'individual')?.id ?? null;
  const hs141TrialId = hs141IndividualId
    ? schedule
      .filter((item) => item.gender === 'men' && item.hill === 'HS141' && item.type === 'trial')
      .filter((item) => (order.get(item.id) ?? 0) < (order.get(hs141IndividualId) ?? 0))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .pop()?.id ?? null
    : null;

  const menPairsCompetitionId = schedule.find((item) => item.type === 'team_men_pairs')?.id ?? null;
  const menPairsTrialId = menPairsCompetitionId
    ? schedule
      .filter((item) => item.gender === 'men' && item.hill === 'HS141' && item.type === 'trial')
      .filter((item) => (order.get(item.id) ?? 0) < (order.get(menPairsCompetitionId) ?? 0))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .pop()?.id ?? null
    : null;

  return {
    hs107TrainingIds,
    hs107TrialId,
    hs107IndividualId,
    hs141TrainingIds,
    hs141TrialId,
    hs141IndividualId,
    menPairsTrialId,
    menPairsCompetitionId,
  };
}

function resolveDisappointmentEventIds(params: {
  schedule: ScheduleItem[];
  completedEventIds: string[];
  trainingBlockProgress: Record<string, number>;
}): string[] | null {
  const { schedule, completedEventIds, trainingBlockProgress } = params;
  const byId = new Map(schedule.map((item) => [item.id, item]));
  const isCompleted = (id: string | null): boolean => {
    if (!id) return false;
    const item = byId.get(id);
    return item ? isEventCompleted(item, completedEventIds, trainingBlockProgress) : false;
  };
  const order = new Map(schedule.map((item, idx) => [item.id, idx]));
  const completedMenEvents = schedule
    .filter((item) => item.gender === 'men')
    .filter((item) => item.type === 'training' || item.type === 'trial' || item.type === 'individual' || item.type === 'team_men_pairs')
    .filter((item) => isCompleted(item.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  if (completedMenEvents.length === 0) return null;
  return completedMenEvents.map((item) => item.id);
}

/** Faworyt: głównie skille i forma; wyniki z treningów/konkursów to tylko jeden z czynników pomniejszych. */
function pickFavorite(
  menTeams: Jumper[],
  scores: Map<string, PerformanceStats>
): { jumper: Jumper; score: number } | null {
  if (menTeams.length === 0) return null;
  const ranked = menTeams
    .map((jumper) => {
      const base = baseJumperScore(jumper);
      const perf = scores.get(jumperId(jumper));
      const finalScore = perf ? base * 0.7 + perf.performance * 0.3 : base;
      return { jumper, score: finalScore, base, perf };
    })
    .sort((a, b) => b.score - a.score);
  const chosen = ranked[0] ?? null;
  console.log('[SJSIM][FAWORYT]', {
    candidates: ranked.length,
    ranking: ranked.slice(0, 10).map((r, i) => ({
      pos: i + 1,
      id: jumperId(r.jumper),
      name: `${r.jumper.name} ${r.jumper.surname}`,
      country: r.jumper.country,
      base: Number(r.base.toFixed(4)),
      perf: r.perf ? Number(r.perf.performance.toFixed(4)) : null,
      finalScore: Number(r.score.toFixed(4)),
      events: r.perf?.events ?? 0,
      top10Rate: r.perf ? Number(r.perf.top10Rate.toFixed(3)) : null,
    })),
    chosen: chosen
      ? { id: jumperId(chosen.jumper), name: `${chosen.jumper.name} ${chosen.jumper.surname}`, country: chosen.jumper.country }
      : null,
  });
  return chosen;
}

function pickDarkHorse(
  menTeams: Jumper[],
  scores: Map<string, PerformanceStats>,
  worldCupOrder: string[]
): Jumper | null {
  if (menTeams.length < 2) return null;
  const ranking = menTeams
    .map((jumper) => {
      const base = darkHorseBaseScore(jumper);
      const perf = scores.get(jumperId(jumper));
      const finalScore = perf ? perf.performance * 0.6 + base * 0.3 : base;
      return { jumper, finalScore, base, perf };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const topIds = new Set(ranking.slice(0, DARK_HORSE_EXCLUDE_TOP).map((entry) => jumperId(entry.jumper)));
  const candidates = ranking.filter((entry) => !topIds.has(jumperId(entry.jumper)));

  const worldCupIndex = (jumper: Jumper): number => worldCupOrder.indexOf(jumperId(jumper)) + 1;
  const eligible = candidates.filter((entry) => {
    const wcPos = worldCupIndex(entry.jumper);
    if (wcPos > 0 && wcPos <= 7) return false;
    // if (entry.perf && entry.perf.events > 0) {
    //   return entry.perf.top10Rate >= DARK_HORSE_MIN_TOP10_RATE;
    // }
    return true;
  });

  const pool = eligible.length > 0 ? eligible : candidates;
  const ranked = pool
    .map((entry) => {
      const perf = entry.perf;
      const darkScore = perf
        ? perf.performance * 0.53 + perf.top10Rate * 0.4 + entry.base * 0.35
        : entry.base;
      const wcPos = worldCupIndex(entry.jumper) || 999;
      return { jumper: entry.jumper, score: darkScore, wcPos };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.wcPos - b.wcPos;
    });

  const chosen = ranked[0]?.jumper ?? null;
  console.log('[SJSIM][CZARNY-KON]', {
    excludeTop: DARK_HORSE_EXCLUDE_TOP,
    candidatesCount: candidates.length,
    eligibleCount: eligible.length,
    poolUsed: eligible.length > 0 ? 'eligible' : 'candidates',
    ranking: ranked.slice(0, 10).map((r, i) => ({
      pos: i + 1,
      id: jumperId(r.jumper),
      name: `${r.jumper.name} ${r.jumper.surname}`,
      country: r.jumper.country,
      darkScore: Number(r.score.toFixed(4)),
      wcPos: r.wcPos === 999 ? '—' : r.wcPos,
    })),
    chosen: chosen
      ? { id: jumperId(chosen), name: `${chosen.name} ${chosen.surname}`, country: chosen.country }
      : null,
  });
  return chosen;
}

function pickDisappointment(
  menTeams: Jumper[],
  scores: Map<string, PerformanceStats>,
  worldCupOrder: string[]
): Jumper | null {
  if (menTeams.length === 0) return null;
  const total = Math.max(2, worldCupOrder.length);
  const ranked = menTeams
    .map((jumper) => {
      const wcPos = worldCupOrder.indexOf(jumperId(jumper)) + 1;
      if (wcPos <= 0 || wcPos > DISAPPOINTMENT_TOP_WC) return null;
      const perf = scores.get(jumperId(jumper));
      if (!perf || perf.events === 0) return null;
      const expected = 1 - (wcPos - 1) / (total - 1);
      const disappointmentScore = expected - perf.performance;
      return { jumper, score: disappointmentScore };
    })
    .filter((entry): entry is { jumper: Jumper; score: number } => entry != null)
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top || top.score <= 0) return null;
  return top.jumper;
}

function pickCountryDuos(
  menTeams: Jumper[],
  scores: Map<string, PerformanceStats>
): { country: string; duo: Jumper[]; score: number }[] {
  const byCountry = new Map<string, Jumper[]>();
  menTeams.forEach((jumper) => {
    const list = byCountry.get(jumper.country) ?? [];
    list.push(jumper);
    byCountry.set(jumper.country, list);
  });

  const duoScores: { country: string; duo: Jumper[]; score: number }[] = [];
  byCountry.forEach((jumpers, country) => {
    if (jumpers.length < 2) return;
    const ranked = jumpers
      .map((jumper) => {
        const base = baseJumperScore(jumper);
        const perf = scores.get(jumperId(jumper));
        const finalScore = perf ? perf.performance * 0.65 + base * 0.35 : base;
        return { jumper, score: finalScore };
      })
      .sort((a, b) => b.score - a.score);
    const duo = [ranked[0]!.jumper, ranked[1]!.jumper];
    const score = ranked[0]!.score + ranked[1]!.score;
    duoScores.push({ country, duo, score });
  });
  return duoScores.sort((a, b) => b.score - a.score);
}

/** Wybór faworyta, czarnego konia i rozczarowania (tylko mężczyźni). */
function getJumperCorners(params: {
  menTeams: Jumper[];
  eventResults?: Record<string, EventResultsSummary>;
  schedule: ScheduleItem[];
  completedEventIds: string[];
  trainingBlockProgress: Record<string, number>;
  menWorldCupOrder: string[];
}): {
  faworyt: CornerEntry | null;
  czarnyKon: CornerEntry | null;
  rozczarowanie: CornerEntry | null;
} {
  const {
    menTeams,
    eventResults,
    schedule,
    completedEventIds,
    trainingBlockProgress,
    menWorldCupOrder,
  } = params;
  if (menTeams.length === 0) {
    return { faworyt: null, czarnyKon: null, rozczarowanie: null };
  }

  const ids = resolveMenEventIds(schedule);
  const byId = new Map(schedule.map((item) => [item.id, item]));
  const isCompleted = (id: string | null): boolean => {
    if (!id) return false;
    const item = byId.get(id);
    return item ? isEventCompleted(item, completedEventIds, trainingBlockProgress) : false;
  };
  const hs141IndividualDone = isCompleted(ids.hs141IndividualId);
  const menPairsTrialDone = isCompleted(ids.menPairsTrialId);

  const order = new Map(schedule.map((item, idx) => [item.id, idx]));
  const mainCompetitionIds = schedule
    .filter((item) => item.isMainCompetition)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((item) => item.id);
  const lastMainCompetitionId = mainCompetitionIds[mainCompetitionIds.length - 1] ?? null;
  const lastMainCompetitionDone = isCompleted(lastMainCompetitionId);

  const performanceScores = buildPerformanceScores(eventResults, schedule);
  const favorite = pickFavorite(menTeams, performanceScores);
  const darkHorse = pickDarkHorse(menTeams, performanceScores, menWorldCupOrder);

  const disappointmentEventIds = resolveDisappointmentEventIds({
    schedule,
    completedEventIds,
    trainingBlockProgress,
  });
  const disappointmentScores = disappointmentEventIds
    ? buildPerformanceScores(eventResults, schedule, new Set(disappointmentEventIds))
    : new Map();
  const disappointmentJumper =
    disappointmentEventIds && disappointmentEventIds.length > 0
      ? pickDisappointment(menTeams, disappointmentScores, menWorldCupOrder)
      : null;

  if (lastMainCompetitionDone) {
    return {
      faworyt: null,
      czarnyKon: null,
      rozczarowanie: disappointmentJumper
        ? { kind: 'jumper', label: 'Największy zawód', jumper: disappointmentJumper }
        : null,
    };
  }

  if (menPairsTrialDone || hs141IndividualDone) {
    const duoScores = pickCountryDuos(menTeams, performanceScores);
    const favoriteDuo = duoScores[0] ?? null;
    const darkHorseDuo = duoScores[2] ?? duoScores[1] ?? null;
    return {
      faworyt: favoriteDuo
        ? { kind: 'country', label: 'Faworyt', country: favoriteDuo.country, duo: favoriteDuo.duo }
        : null,
      czarnyKon: darkHorseDuo
        ? { kind: 'country', label: 'Czarny koń', country: darkHorseDuo.country, duo: darkHorseDuo.duo }
        : null,
      rozczarowanie: disappointmentJumper
        ? { kind: 'jumper', label: 'Największy zawód', jumper: disappointmentJumper }
        : null,
    };
  }

  return {
    faworyt: favorite ? { kind: 'jumper', label: 'Faworyt', jumper: favorite.jumper } : null,
    czarnyKon: darkHorse ? { kind: 'jumper', label: 'Czarny koń', jumper: darkHorse } : null,
    rozczarowanie: disappointmentJumper
      ? { kind: 'jumper', label: 'Największy zawód', jumper: disappointmentJumper }
      : null,
  };
}

function GenderIconMale(): JSX.Element {
  return (
    <svg className="predazzo-dash__gender-icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="10" r="5" />
      <path d="M15 3h6v6" />
      <path d="M15 9L21 3" />
    </svg>
  );
}

function GenderIconFemale(): JSX.Element {
  return (
    <svg className="predazzo-dash__gender-icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v9M8 20h8" />
    </svg>
  );
}

function GenderIcon({ gender }: { gender: ScheduleItem['gender'] }): JSX.Element {
  if (gender === 'men') return <GenderIconMale />;
  if (gender === 'women') return <GenderIconFemale />;
  return (
    <span className="predazzo-dash__gender-icon-mixed" aria-hidden>
      <GenderIconMale />
      <GenderIconFemale />
    </span>
  );
}

function NextCardWeatherIcon({ condition }: { condition: NextEventWeather['condition'] }): JSX.Element {
  return (
    <img
      src={WEATHER_ICONS[condition]}
      alt=""
      className="predazzo-dash__weather-icon-img"
      aria-hidden
    />
  );
}

function WindIcon(): JSX.Element {
  return (
    <svg className="predazzo-dash__wind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

/** Ikona „następne” — strzałka w prawo w kółku */
function NextUpIcon(): JSX.Element {
  return (
    <svg className="predazzo-dash__next-up-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h6M14 10l3 2-3 2" />
    </svg>
  );
}

function WindLabel({ speed }: { speed: number }): string {
  const abs = Math.abs(speed);
  const dirLabel = speed < 0 ? 'w plecy' : 'pod narty';
  return `${abs.toFixed(1)} m/s ${dirLabel}`;
}

/** Wiersze harmonogramu z datą i godziną (tabela). */
function scheduleTableRows(
  completedEventIds: string[],
  trainingBlockProgress: Record<string, number>,
  schedule: ScheduleItem[]
): { id: string; date: string; time: string; label: string; isPast: boolean; isMain: boolean }[] {
  return schedule.map((item) => ({
    id: item.id,
    date: formatScheduleDate(item.date),
    time: item.time,
    label:
      item.type === 'training' && (item.trainingSeries ?? 0) >= 2
        ? `${item.label} ×${item.trainingSeries}`
        : item.label,
    isPast: isEventCompleted(item, completedEventIds, trainingBlockProgress),
    isMain: item.isMainCompetition,
  }));
}

const MONTHS_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'] as const;

/** Data YYYY-MM-DD → "13 lutego" (harmonogram, bez roku) */
function formatScheduleDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const monthIdx = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  return `${day} ${MONTHS_PL[monthIdx] ?? m}`;
}

const WEEKDAYS_PL = ['ndz', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'] as const;

/** Data YYYY-MM-DD → "pon, 10 lutego" (karta następnych skoków) */
function formatDateWithYear(iso: string): string {
  const [, m, d] = iso.split('-');
  const monthIdx = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  const date = new Date(`${iso}T00:00:00`);
  const weekday = Number.isNaN(date.getTime()) ? '' : WEEKDAYS_PL[date.getDay()] ?? '';
  const weekdayLabel = weekday ? `${weekday}, ` : '';
  return `${weekdayLabel}${day} ${MONTHS_PL[monthIdx] ?? m}`;
}

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Klucz bloku treningowego: jeden wpis w harmonogramie z trainingSeries 2+ to jeden blok
 * (w grze rozgrywany sekwencyjnie jako trening I, II, III). Stan: ile już rozegrano (0, 1, 2).
 */
function getTrainingBlockKey(item: ScheduleItem): string | null {
  if (item.type !== 'training' || (item.trainingSeries ?? 0) < 2) return null;
  return item.id;
}

/** Ile treningów w tym bloku już rozegrano (0 → następny to I, 1 → II, 2 → III). */
function getCompletedInBlock(blockKey: string | null, progress: Record<string, number>): number {
  if (!blockKey) return 0;
  const n = progress[blockKey] ?? 0;
  return Math.max(0, n);
}

/** Krótka etykieta typu np. "Trening mężczyzn III" — numer I/II/III z sekwencji w bloku. */
function formatEventShortLabel(
  item: ScheduleItem,
  completedInBlock: number = 0
): string {
  const gender = item.gender === 'men' ? 'mężczyzn' : item.gender === 'women' ? 'kobiet' : 'mikstów';
  if (item.type === 'training') {
    const series = item.trainingSeries ?? 0;
    const suffix =
      series >= 2 ? ` ${ROMAN[completedInBlock + 1]}` : ''; // I, II, III w zależności od stanu
    return `Trening ${gender}${suffix}`;
  }
  if (item.type === 'trial') return `Seria próbna ${gender}`;
  return item.label;
}

function isCompetitionType(type: EventResultsSummary['type']): boolean {
  return type === 'individual' || type === 'team_mixed' || type === 'team_men_pairs';
}

function isTrainingType(type: EventResultsSummary['type']): boolean {
  return type === 'training' || type === 'trial';
}

function jumperDisplayNameFromId(id: string): string {
  const parts = id.split('-');
  return parts.length > 1 ? parts.slice(1).join(' ') : id;
}

function eventMetaLabel(meta: { date: string; time: string }): string {
  return `${formatScheduleDate(meta.date)} · ${meta.time}`;
}

function buildResultsRows(
  summary: EventResultsSummary,
  jumperById: Map<string, Jumper>
): { rank: number; label: string; country: string; points: number }[] {
  const isTeamEvent = summary.type === 'team_mixed' || summary.type === 'team_men_pairs';
  if (isTeamEvent) {
    return (summary.teamStandings ?? [])
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => ({
        rank: entry.rank,
        label: countryCodeToName(entry.country),
        country: entry.country,
        points: entry.totalPoints,
      }));
  }
  return summary.standings
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => {
      const jumper = jumperById.get(entry.jumperId);
      return {
        rank: entry.rank,
        label: jumper ? `${jumper.name} ${jumper.surname}` : jumperDisplayNameFromId(entry.jumperId),
        country: entry.country,
        points: entry.totalPoints,
      };
    });
}

const REVEAL_DELAY_MS = 8000;

/** Tylko gdy trener z wybraną kadrą — zwraca kod kraju do pokazania flagi i nazwy. */
function getCoachCountry(config: PredazzoDashboardProps['config']): string | null {
  if (config?.mode !== 'coach' || !config.selectedCountry) return null;
  return config.selectedCountry;
}

function hasEnoughTeamMembers(
  country: string,
  type: ScheduleItem['type'],
  menTeams: Jumper[],
  womenTeams: Jumper[]
): boolean {
  if (!country) return false;
  if (type === 'team_men_pairs') {
    return menTeams.filter((j) => j.country === country).length >= 2;
  }
  if (type === 'team_mixed') {
    const men = menTeams.filter((j) => j.country === country).length;
    const women = womenTeams.filter((j) => j.country === country).length;
    return men >= 2 && women >= 2;
  }
  return false;
}

function cornerLabel(corner: CornerEntry): string {
  if (corner.kind === 'jumper') {
    return `${corner.jumper.name} ${corner.jumper.surname}`;
  }
  const duoLabel = corner.duo.length > 0
    ? ` · ${corner.duo.map((j) => `${j.name} ${j.surname}`).join(' + ')}`
    : '';
  return `${countryCodeToName(corner.country)}${duoLabel}`;
}

function cornerCountry(corner: CornerEntry): string {
  return corner.kind === 'jumper' ? corner.jumper.country : corner.country;
}

function topTeamStandings(standings: TeamEventStanding[] | undefined): TeamEventStanding[] {
  return (standings ?? []).filter((s) => s.rank <= 3).sort((a, b) => a.rank - b.rank);
}

interface ArchiveTeamStanding {
  teamId: string;
  country: string;
  totalPoints: number;
}

interface ArchiveIndividualStanding {
  bib: number;
  jumperId: string;
  country: string;
  totalPoints: number;
  jumpResults: ArchiveJumpResult['result'][];
}

interface ArchiveTeamEntry {
  id: string;
  country: string;
  members: Jumper[];
}

function archiveHillScoring(hill: PredazzoArchiveEntry['hill']): HillScoringParams {
  return hill === 'HS107' ? HILL_PARAMS['predazzo-hs107'] : HILL_PARAMS['predazzo-hs141'];
}

function windCompPoints(value: ArchiveJumpResult['wind'], scoring: HillScoringParams): number {
  if (value.average >= 0) return -value.average * scoring.windHeadwindPerMs;
  return Math.abs(value.average) * scoring.windTailwindPerMs;
}

function valColorClass(v: number, prefix: 'wind' | 'comp'): string {
  return `competition-screen__val competition-screen__val--${prefix}-${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}`;
}

function buildArchiveTeams(results: ArchiveJumpResult[]): ArchiveTeamEntry[] {
  const byTeam = new Map<string, ArchiveTeamEntry>();
  results.forEach((r) => {
    if (!r.teamId) return;
    const team = byTeam.get(r.teamId) ?? { id: r.teamId, country: r.teamId, members: [] };
    if (r.slotInTeam != null) {
      team.members[r.slotInTeam] = r.jumper;
    } else if (!team.members.some((m) => jumperId(m) === jumperId(r.jumper))) {
      team.members.push(r.jumper);
    }
    byTeam.set(r.teamId, team);
  });
  return [...byTeam.values()].map((team) => ({
    ...team,
    members: team.members.filter(Boolean),
  }));
}

function buildArchiveIndividualStandings(
  results: ArchiveJumpResult[],
  bibById: Map<string, number>,
  roundIndex: number
): ArchiveIndividualStanding[] {
  const totals = new Map<string, { total: number; jumpResults: ArchiveJumpResult['result'][] }>();
  results
    .filter((r) => r.roundIndex <= roundIndex)
    .forEach((r) => {
      const id = jumperId(r.jumper);
      const existing = totals.get(id);
      if (existing) {
        existing.total += r.result.points;
        existing.jumpResults.push(r.result);
      } else {
        totals.set(id, { total: r.result.points, jumpResults: [r.result] });
      }
    });
  const standings: ArchiveIndividualStanding[] = [];
  totals.forEach((value, id) => {
    const jumper = results.find((r) => jumperId(r.jumper) === id)?.jumper;
    if (!jumper) return;
    standings.push({
      bib: bibById.get(id) ?? 0,
      jumperId: id,
      country: jumper.country,
      totalPoints: value.total,
      jumpResults: value.jumpResults,
    });
  });
  return standings;
}

function buildArchiveTeamStandings(
  results: ArchiveJumpResult[],
  teams: ArchiveTeamEntry[],
  roundIndex: number
): ArchiveTeamStanding[] {
  return teams.map((team) => {
    const teamResults = results
      .filter((r) => r.teamId === team.id && r.roundIndex <= roundIndex)
      .map((r) => r.result);
    const totalPoints = teamResults.reduce((acc, r) => acc + r.points, 0);
    return {
      teamId: team.id,
      country: team.country,
      totalPoints,
    };
  });
}

function findTeamPosition(standings: ArchiveTeamStanding[], teamId?: string): number | null {
  if (!teamId) return null;
  const pos = standings.findIndex((s) => s.teamId === teamId);
  return pos >= 0 ? pos + 1 : null;
}

function findJumperPosition(standings: ArchiveIndividualStanding[], jumper: Jumper): number | null {
  const id = jumperId(jumper);
  const pos = standings.findIndex((s) => s.jumperId === id);
  return pos >= 0 ? pos + 1 : null;
}

function formatStylePoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function medalistsForEntry(entry: PredazzoArchiveEntry): { rank: number; label: string; country: string }[] {
  const isTeamEvent = entry.type === 'team_mixed' || entry.type === 'team_men_pairs';
  if (isTeamEvent) {
    const teams = buildArchiveTeams(entry.results);
    const standings = buildArchiveTeamStandings(entry.results, teams, entry.totalRounds - 1)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 3);
    return standings.map((team, idx) => ({
      rank: idx + 1,
      label: countryCodeToName(team.country),
      country: team.country,
    }));
  }
  const bibById = new Map(entry.results.map((r) => [jumperId(r.jumper), r.bib]));
  const standings = buildArchiveIndividualStandings(entry.results, bibById, entry.totalRounds - 1)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 3);
  return standings.map((s, idx) => {
    const jumper = entry.results.find((r) => jumperId(r.jumper) === s.jumperId)?.jumper;
    return {
      rank: idx + 1,
      label: jumper ? `${jumper.name} ${jumper.surname}` : s.jumperId,
      country: s.country,
    };
  });
}

function entryLabelWithHill(entry: PredazzoArchiveEntry): string {
  const suffix = `(${entry.hill})`;
  return entry.label.includes(suffix) ? entry.label : `${entry.label} ${suffix}`;
}

export const PredazzoDashboard = ({
  config,
  gameData,
  onBack,
  onGoToNextEvent,
  completedEventIds,
  trainingBlockProgress,
  skipIntro,
  snowEnabled,
  eventResults,
  archiveEntries,
  showFinalDialog = false,
  onCloseFinalDialog,
}: PredazzoDashboardProps): JSX.Element => {
  const [revealed, setRevealed] = useState(Boolean(skipIntro));
  useEffect(() => {
    if (skipIntro) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [skipIntro]);

  const [tab, setTab] = useState<'main' | 'archive'>('main');
  /** Pokaż ekran przed eventem (jak przy każdym konkursie). */
  const [previewEvent, setPreviewEvent] = useState<ScheduleItem | null>(null);
  const [teamSelectionEvent, setTeamSelectionEvent] = useState<ScheduleItem | null>(null);
  const [pendingTeamLineup, setPendingTeamLineup] = useState<Jumper[] | null>(null);
  const [lockedMixedLineups, setLockedMixedLineups] = useState<Record<string, Jumper[]> | null>(null);
  const [lockedMenPairsLineups, setLockedMenPairsLineups] = useState<Record<string, Jumper[]> | null>(null);
  const archiveItems = useMemo(
    () =>
      (archiveEntries ?? [])
        .slice()
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [archiveEntries]
  );
  const predazzoArchive = archiveItems.filter(isPredazzoEntry);
  const sapporoArchive = archiveItems.filter((entry) => entry.source === 'sapporo');
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  useEffect(() => {
    if (archiveItems.length === 0) {
      if (selectedArchiveId) setSelectedArchiveId(null);
      return;
    }
    if (!selectedArchiveId || !archiveItems.some((entry) => entry.id === selectedArchiveId)) {
      setSelectedArchiveId(archiveItems[0]?.id ?? null);
    }
  }, [archiveItems, selectedArchiveId]);
  const schedule = resolveSchedule(gameData);
  const next = getNextEventByProgress(completedEventIds, trainingBlockProgress, schedule);
  const weather = getNextEventWeather(next, trainingBlockProgress, schedule);
  const menTeams = resolveMenTeams(gameData);
  const womenTeams = resolveWomenTeams(gameData);
  const allJumpers = [...resolveMenJumpers(gameData), ...resolveWomenJumpers(gameData)];
  const menWorldCupOrder = resolveMenWorldCupOrder(gameData);
  const corners = getJumperCorners({
    menTeams,
    eventResults,
    schedule,
    completedEventIds,
    trainingBlockProgress,
    menWorldCupOrder,
  });
  const scheduleRows = scheduleTableRows(completedEventIds, trainingBlockProgress, schedule);
  /** Tymczasowo wyłączony efekt śniegu. */
  const showSnow = false;
  const coachCountry = getCoachCountry(config);
  const jumperById = new Map(allJumpers.map((j) => [jumperId(j), j]));
  const medalEvents = schedule.filter((item) => item.isMainCompetition);
  const selectedArchive = archiveItems.find((entry) => entry.id === selectedArchiveId) ?? null;
  const scheduleById = new Map(schedule.map((item) => [item.id, item]));
  const lastCompetitionEntry = predazzoArchive.find((entry) => isCompetitionType(entry.type)) ?? null;
  const lastTrainingEntry = predazzoArchive.find((entry) => isTrainingType(entry.type)) ?? null;
  const resultsById = new Map(Object.values(eventResults ?? {}).map((summary) => [summary.eventId, summary]));
  const scheduleOrder = new Map(schedule.map((item, idx) => [item.id, idx]));
  const lastCompetitionBySchedule = [...resultsById.values()]
    .map((summary) => {
      const item = scheduleById.get(summary.eventId);
      if (!item) return null;
      return { summary, item, order: scheduleOrder.get(item.id) ?? 0 };
    })
    .filter((entry): entry is { summary: EventResultsSummary; item: ScheduleItem; order: number } => Boolean(entry))
    .filter((entry) => isCompetitionType(entry.summary.type))
    .sort((a, b) => a.order - b.order)
    .at(-1) ?? null;
  const lastTrainingBySchedule = [...resultsById.values()]
    .map((summary) => {
      const item = scheduleById.get(summary.eventId);
      if (!item) return null;
      return { summary, item, order: scheduleOrder.get(item.id) ?? 0 };
    })
    .filter((entry): entry is { summary: EventResultsSummary; item: ScheduleItem; order: number } => Boolean(entry))
    .filter((entry) => isTrainingType(entry.summary.type))
    .sort((a, b) => a.order - b.order)
    .at(-1) ?? null;

  type DisplayEntry = {
    eventId: string;
    label: string;
    type: ScheduleItem['type'];
    gender: ScheduleItem['gender'];
    date: string;
    time: string;
  };

  const displayFromArchive = (entry: PredazzoArchiveEntry): DisplayEntry => ({
    eventId: entry.eventId,
    label: entry.label,
    type: entry.type,
    gender: entry.gender,
    date: entry.date,
    time: entry.time,
  });

  const displayFromSchedule = (item: ScheduleItem): DisplayEntry => ({
    eventId: item.id,
    label: item.label,
    type: item.type,
    gender: item.gender,
    date: item.date,
    time: item.time,
  });

  const primaryDisplay =
    (lastCompetitionEntry && displayFromArchive(lastCompetitionEntry)) ||
    (lastCompetitionBySchedule && displayFromSchedule(lastCompetitionBySchedule.item)) ||
    (lastTrainingEntry && displayFromArchive(lastTrainingEntry)) ||
    (lastTrainingBySchedule && displayFromSchedule(lastTrainingBySchedule.item)) ||
    null;

  const trainingDisplay =
    (lastTrainingEntry && displayFromArchive(lastTrainingEntry)) ||
    (lastTrainingBySchedule && displayFromSchedule(lastTrainingBySchedule.item)) ||
    null;

  const secondaryDisplay =
    primaryDisplay && isCompetitionType(primaryDisplay.type) && trainingDisplay && trainingDisplay.eventId !== primaryDisplay.eventId
      ? trainingDisplay
      : null;

  const entryDisplayLabel = (entry: DisplayEntry): string =>
    scheduleById.get(entry.eventId)?.label ?? entry.label;
  const primaryResult = primaryDisplay ? { entry: primaryDisplay, summary: resultsById.get(primaryDisplay.eventId) ?? null } : null;
  const secondaryResult = secondaryDisplay ? { entry: secondaryDisplay, summary: resultsById.get(secondaryDisplay.eventId) ?? null } : null;
  const primaryTitle = primaryResult ? entryDisplayLabel(primaryResult.entry) : '';
  const secondaryTitle = secondaryResult ? entryDisplayLabel(secondaryResult.entry) : '';
  const primarySummary = primaryResult?.summary ?? null;
  const secondarySummary = secondaryResult?.summary ?? null;
  const primaryRows = primarySummary ? buildResultsRows(primarySummary, jumperById) : [];
  const secondaryRows = secondarySummary ? buildResultsRows(secondarySummary, jumperById) : [];
  const hasSecondary = Boolean(secondaryResult);
  const resultsAreaClass = hasSecondary
    ? 'predazzo-dash__results-area predazzo-dash__results-area--dual'
    : 'predazzo-dash__results-area';

  const nextTrainingBlockKey = next ? getTrainingBlockKey(next) : null;
  const completedInBlock = getCompletedInBlock(nextTrainingBlockKey, trainingBlockProgress);
  const trainingSeriesIndex =
    next && next.type === 'training' && (next.trainingSeries ?? 0) >= 2
      ? completedInBlock + 1
      : undefined;

  const handleShowDetails = (eventId: string): void => {
    const match = archiveItems.find((entry) => entry.source === 'predazzo' && entry.eventId === eventId) ?? null;
    if (match) {
      setSelectedArchiveId(match.id);
    }
    setTab('archive');
  };

  useEffect(() => {
    console.log('[SJSIM][PRED-DASH][RESULTS]', {
      archiveCount: predazzoArchive.length,
      archiveIds: predazzoArchive.map((entry) => ({ id: entry.id, eventId: entry.eventId, type: entry.type })),
      lastCompetitionEntry: lastCompetitionEntry?.eventId ?? null,
      lastTrainingEntry: lastTrainingEntry?.eventId ?? null,
      lastCompetitionBySchedule: lastCompetitionBySchedule?.summary.eventId ?? null,
      lastTrainingBySchedule: lastTrainingBySchedule?.summary.eventId ?? null,
      primary: primaryResult
        ? { eventId: primaryResult.entry.eventId, type: primaryResult.entry.type, label: primaryResult.entry.label }
        : null,
      secondary: secondaryResult
        ? { eventId: secondaryResult.entry.eventId, type: secondaryResult.entry.type, label: secondaryResult.entry.label }
        : null,
      resultsKeys: Object.keys(eventResults ?? {}),
    });
  }, [
    predazzoArchive,
    lastCompetitionEntry,
    lastTrainingEntry,
    lastCompetitionBySchedule,
    lastTrainingBySchedule,
    primaryResult,
    secondaryResult,
    eventResults,
  ]);

  const medalSections = medalEvents
    .map((event) => {
      const summary = eventResults?.[event.id];
      if (!summary) return null;
      const isTeamEvent = event.type === 'team_mixed' || event.type === 'team_men_pairs';
      if (isTeamEvent) {
        const topTeams = topTeamStandings(summary.teamStandings);
        return {
          event,
          entries: topTeams.map((entry) => ({
            rank: entry.rank,
            label: countryCodeToName(entry.country),
            country: entry.country,
          })),
        };
      }
      const top = summary.standings
        .filter((s) => s.rank <= 3)
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => {
          const jumper = jumperById.get(entry.jumperId);
          return {
            rank: entry.rank,
            label: jumper ? `${jumper.name} ${jumper.surname}` : entry.jumperId,
            country: entry.country,
          };
        });
      return { event, entries: top };
    })
    .filter((section): section is { event: ScheduleItem; entries: { rank: number; label: string; country: string }[] } => Boolean(section));

  /** Czy następny event to trening (men/women) lub seria próbna (także mikst). */
  const isTrainingOrTrialPreview = next != null &&
    ((next.type === 'training' && (next.gender === 'men' || next.gender === 'women')) || next.type === 'trial');
  const isIndividualCompetition = next != null &&
    next.type === 'individual' &&
    (next.gender === 'men' || next.gender === 'women');
  const isTeamEvent = next != null && (next.type === 'team_men_pairs' || next.type === 'team_mixed');
  const isMixedTrial = next != null && next.type === 'trial' && next.gender === 'mixed';
  const isMenPairsTrial = next != null && next.type === 'trial' && next.gender === 'men' && next.hill === 'HS141';
  const mixedTrialId =
    schedule.find((item) => item.type === 'trial' && item.gender === 'mixed')?.id ?? null;
  const mixedTrialDone = mixedTrialId ? Boolean(eventResults?.[mixedTrialId]) : false;
  const menPairsTrialId = resolveMenEventIds(schedule).menPairsTrialId;
  const menPairsTrialDone = menPairsTrialId ? Boolean(eventResults?.[menPairsTrialId]) : false;
  const isCoachWithCountry = config?.mode === 'coach' && !!config.selectedCountry;
  const teamTypeForSelection = isMixedTrial ? 'team_mixed' : next?.type;
  const canSelectTeam =
    (isTeamEvent || isMixedTrial) &&
    isCoachWithCountry &&
    !(next?.type === 'team_mixed' && mixedTrialDone) &&
    !(next?.type === 'team_men_pairs' && menPairsTrialDone) &&
    !!(
      next &&
      config?.selectedCountry &&
      teamTypeForSelection &&
      hasEnoughTeamMembers(config.selectedCountry, teamTypeForSelection, menTeams, womenTeams)
    );
  const canReuseMixedLineup =
    next != null && next.type === 'team_mixed' && lockedMixedLineups != null;
  const canReuseMenPairsLineup =
    next != null && next.type === 'team_men_pairs' && lockedMenPairsLineups != null;

  const buildDefaultMixedLineups = (): Record<string, Jumper[]> => {
    const teams = buildMixedTeams(menTeams, womenTeams, undefined, eventResults);
    const map: Record<string, Jumper[]> = {};
    teams.forEach((team) => {
      map[team.country] = team.members;
    });
    return map;
  };

  const buildDefaultMenPairsLineups = (): Record<string, Jumper[]> => {
    const teams = buildTeamPairs(menTeams, undefined, eventResults);
    const map: Record<string, Jumper[]> = {};
    teams.forEach((team) => {
      map[team.country] = team.members;
    });
    return map;
  };

  const handleGoToNextEvent = (): void => {
    if (canSelectTeam && next && (isTeamEvent || isMixedTrial || isMenPairsTrial)) {
      if (canReuseMixedLineup || canReuseMenPairsLineup || pendingTeamLineup) {
        setPreviewEvent(next);
      } else {
        setTeamSelectionEvent(next);
      }
      return;
    }
    if (next && next.type === 'team_mixed' && mixedTrialDone) {
      setPreviewEvent(next);
      return;
    }
    if (next && next.type === 'team_men_pairs' && menPairsTrialDone) {
      setPreviewEvent(next);
      return;
    }
    if ((isTrainingOrTrialPreview || isIndividualCompetition || isTeamEvent || isMixedTrial) && next) {
      setPreviewEvent(next);
      return;
    }
    advanceToNextEvent();
  };

  const advanceToNextEvent = (): void => {
    if (next) {
      onGoToNextEvent({ event: next, weather, trainingSeriesIndex });
    }
  };

  const handlePreviewConfirm = (params: { participating?: Jumper[]; autoBar: boolean; juryBravery?: JuryBravery }): void => {
    setPreviewEvent(null);
    if (next) {
      const isTeamCompetition =
        next.type === 'team_mixed' ||
        next.type === 'team_men_pairs' ||
        (next.type === 'trial' && next.gender === 'mixed');
      if (isTeamCompetition && config?.selectedCountry) {
        if (next.type === 'team_mixed' || (next.type === 'trial' && next.gender === 'mixed')) {
          const base = lockedMixedLineups ?? buildDefaultMixedLineups();
          const nextLineups = { ...base };
          if (pendingTeamLineup && !mixedTrialDone) nextLineups[config.selectedCountry] = pendingTeamLineup;
          setLockedMixedLineups(nextLineups);
          setPendingTeamLineup(null);
          onGoToNextEvent({
            event: next,
            weather,
            teamLineups: nextLineups,
            participating: mixedTrialDone ? undefined : params.participating,
            autoBar: params.autoBar,
            juryBravery: params.juryBravery,
            trainingSeriesIndex,
          });
          return;
        }
        if (next.type === 'team_men_pairs' || (next.type === 'trial' && next.gender === 'men')) {
          const base = lockedMenPairsLineups ?? buildDefaultMenPairsLineups();
          const nextLineups = { ...base };
          if (pendingTeamLineup && !menPairsTrialDone) nextLineups[config.selectedCountry] = pendingTeamLineup;
          setLockedMenPairsLineups(nextLineups);
          setPendingTeamLineup(null);
          onGoToNextEvent({
            event: next,
            weather,
            teamLineups: nextLineups,
            participating: menPairsTrialDone ? undefined : params.participating,
            autoBar: params.autoBar,
            juryBravery: params.juryBravery,
            trainingSeriesIndex,
          });
          return;
        }
        if (pendingTeamLineup) {
          const lineup = pendingTeamLineup;
          setPendingTeamLineup(null);
          onGoToNextEvent({
            event: next,
            weather,
            teamLineups: {
              [config.selectedCountry]: lineup,
            },
            participating: params.participating,
            autoBar: params.autoBar,
            juryBravery: params.juryBravery,
            trainingSeriesIndex,
          });
          return;
        }
      }
      onGoToNextEvent({
        event: next,
        participating: params.participating,
        autoBar: params.autoBar,
        juryBravery: params.juryBravery,
        weather,
        trainingSeriesIndex,
      });
    }
  };

  const handleTeamSelectionConfirm = (lineup: Jumper[]): void => {
    setTeamSelectionEvent(null);
    if (next) {
      if (next.type === 'team_mixed' || (next.type === 'trial' && next.gender === 'mixed')) {
        const base = lockedMixedLineups ?? buildDefaultMixedLineups();
        if (config?.selectedCountry) {
          base[config.selectedCountry] = lineup;
        }
        setLockedMixedLineups({ ...base });
      } else if (next.type === 'team_men_pairs' || (next.type === 'trial' && next.gender === 'men')) {
        const base = lockedMenPairsLineups ?? buildDefaultMenPairsLineups();
        if (config?.selectedCountry) {
          base[config.selectedCountry] = lineup;
        }
        setLockedMenPairsLineups({ ...base });
      }
      setPendingTeamLineup(lineup);
      setPreviewEvent(next);
    }
  };

  return (
    <div
      className={`predazzo-dash ${revealed ? 'predazzo-dash--revealed' : ''} ${tab === 'archive' ? 'predazzo-dash--archive' : ''}`}
      style={{ backgroundImage: `url(${menuBg})` }}
      data-precipitation={showSnow ? 'snow' : undefined}
    >
      <div className="predazzo-dash__overlay" />
      {showSnow && <div className="predazzo-dash__snow" aria-hidden />}

      {previewEvent && (
        <CompetitionPreviewDialog
          event={previewEvent}
          config={config ?? null}
          weather={weather}
          gameData={gameData}
          eventResults={eventResults}
          trainingSeriesIndex={trainingSeriesIndex}
          teamLineupPreview={
            pendingTeamLineup ??
            (coachCountry ? lockedMixedLineups?.[coachCountry] : undefined) ??
            (coachCountry ? lockedMenPairsLineups?.[coachCountry] : undefined)
          }
          allowParticipationToggle={
            (previewEvent.type === 'training' &&
              (previewEvent.gender === 'men' || previewEvent.gender === 'women')) ||
            (previewEvent.type === 'trial' &&
              (previewEvent.gender === 'men' || previewEvent.gender === 'women' || previewEvent.gender === 'mixed'))
          }
          onConfirm={handlePreviewConfirm}
          onCancel={() => setPreviewEvent(null)}
        />
      )}
      {teamSelectionEvent && (
        <TeamSelectionDialog
          event={teamSelectionEvent}
          config={config ?? null}
          gameData={gameData}
          onConfirm={handleTeamSelectionConfirm}
          onCancel={() => {
            setTeamSelectionEvent(null);
            setPendingTeamLineup(null);
          }}
        />
      )}
      {showFinalDialog && (
        <div className="predazzo-dash__final-overlay" role="dialog" aria-modal="true">
          <div className="predazzo-dash__final">
            <h2 className="predazzo-dash__final-title">To już koniec konkursów w Predazzo</h2>
            <p className="predazzo-dash__final-text">
              Dziękujemy za grę! Oto pełna lista medalistów i medalistek z konkursów.
            </p>
            <div className="predazzo-dash__final-medals">
              {medalSections.map((section) => (
                <div key={section.event.id} className="predazzo-dash__final-section">
                  <h3 className="predazzo-dash__final-section-title">
                    {section.event.label}
                  </h3>
                  {section.entries.length > 0 ? (
                    <ol className="predazzo-dash__final-list">
                      {section.entries.map((entry) => (
                        <li key={`${section.event.id}-${entry.rank}`} className="predazzo-dash__final-item">
                          <span className="predazzo-dash__final-rank">{entry.rank}.</span>
                          <span className="predazzo-dash__final-flag" aria-hidden>
                            {countryToFlag(entry.country)}
                          </span>
                          <span className="predazzo-dash__final-name">{entry.label}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="predazzo-dash__final-empty">Brak wyników.</p>
                  )}
                </div>
              ))}
            </div>
            <p className="predazzo-dash__final-text">
              Możesz sprawdzać wyniki w archiwum albo rozpocząć nową grę.
            </p>
            <div className="predazzo-dash__final-actions">
              <button
                type="button"
                className="predazzo-dash__final-btn predazzo-dash__final-btn--secondary"
                onClick={() => {
                  setTab('archive');
                  onCloseFinalDialog?.();
                }}
              >
                Archiwum
              </button>
              <button
                type="button"
                className="predazzo-dash__final-btn"
                onClick={() => onCloseFinalDialog?.()}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {!revealed && (
        <div className="predazzo-dash__reveal" aria-hidden>
          <div className="predazzo-dash__reveal-inner">
            <span className="predazzo-dash__reveal-text">Predazzo</span>
            <p className="predazzo-dash__reveal-tagline">
              Czas na najważniejszą rywalizację w sezonie! Kto okaże się najlepszy? Czy genialne słoweńskie rodzeństwo podtrzyma dominację? Czy przebudzi się kadra Polaków na czele z młodym talentem?
              Zaczynamy od treningów mężczyzn i kobiet.
            </p>
            <span className="predazzo-dash__reveal-line" aria-hidden />
          </div>
          <div className="predazzo-dash__reveal-progress" aria-hidden>
            <span className="predazzo-dash__reveal-progress-bar" />
          </div>
        </div>
      )}

      <header className="predazzo-dash__header">
        <button
          type="button"
          className="predazzo-dash__back"
          onClick={onBack}
          aria-label="Wróć do menu"
        >
          <BackIcon />
        </button>
        <div className="predazzo-dash__title-block">
          <h1 className="predazzo-dash__title">Sj.Sim</h1>
          <p className="predazzo-dash__subtitle">Predazzo 2026</p>
        </div>
        {coachCountry && (
          <span className="predazzo-dash__role-label" title={`Trener ${countryCodeToName(coachCountry)}`}>
            <span className="predazzo-dash__role-flag" aria-hidden>{countryToFlag(coachCountry)}</span>
            <span className="predazzo-dash__role-text">{countryCodeToName(coachCountry)}</span>
          </span>
        )}
        <div className="predazzo-dash__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'main'}
            className={`predazzo-dash__tab ${tab === 'main' ? 'predazzo-dash__tab--active' : ''}`}
            onClick={() => setTab('main')}
          >
            <TrophyIcon />
            <span>Przegląd</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'archive'}
            className={`predazzo-dash__tab ${tab === 'archive' ? 'predazzo-dash__tab--active' : ''}`}
            onClick={() => setTab('archive')}
          >
            <ArchiveIcon />
            <span>Archiwum</span>
          </button>
        </div>
      </header>

      <div className="predazzo-dash__view">
        <div className="predazzo-dash__view-main">
          <div className="predazzo-dash__layout">
            <aside className="predazzo-dash__left">
              <section className="predazzo-dash__corners">
                {corners.faworyt && (
                  <div className="predazzo-dash__corner predazzo-dash__corner--faworyt">
                    <span className="predazzo-dash__corner-label">{corners.faworyt.label}</span>
                    <span className="predazzo-dash__corner-jumper">
                      {countryToFlag(cornerCountry(corners.faworyt))}{' '}
                      {cornerLabel(corners.faworyt)}
                    </span>
                  </div>
                )}
                {corners.czarnyKon && (
                  <div className="predazzo-dash__corner predazzo-dash__corner--dark">
                    <span className="predazzo-dash__corner-label">{corners.czarnyKon.label}</span>
                    <span className="predazzo-dash__corner-jumper">
                      {countryToFlag(cornerCountry(corners.czarnyKon))}{' '}
                      {cornerLabel(corners.czarnyKon)}
                    </span>
                  </div>
                )}
                {corners.rozczarowanie && (
                  <div className="predazzo-dash__corner predazzo-dash__corner--disappointment">
                    <span className="predazzo-dash__corner-label">{corners.rozczarowanie.label}</span>
                    <span className="predazzo-dash__corner-jumper">
                      {countryToFlag(cornerCountry(corners.rozczarowanie))}{' '}
                      {cornerLabel(corners.rozczarowanie)}
                    </span>
                  </div>
                )}
              </section>
              <section className="predazzo-dash__schedule-panel">
                <h2 className="predazzo-dash__schedule-title">Harmonogram</h2>
                <div className="predazzo-dash__schedule-wrap">
                  <table className="predazzo-dash__schedule-table">
                    <thead>
                      <tr>
                        <th>Dzień</th>
                        <th>Godz.</th>
                        <th>Wydarzenie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleRows.map((row) => (
                        <tr
                          key={row.id}
                          className={`${row.isPast ? 'predazzo-dash__schedule-row--past' : ''} ${row.isMain ? 'predazzo-dash__schedule-row--main' : ''}`}
                        >
                          <td>{row.date}</td>
                          <td>{row.time}</td>
                          <td>{row.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </aside>

            <main className="predazzo-dash__center" aria-hidden />

            <aside className="predazzo-dash__right">
              {next && (
                <section className="predazzo-dash__next" aria-label="Następne skoki">
                  <div className="predazzo-dash__next-type-row">
                    <span className="predazzo-dash__next-type">
                      {formatEventShortLabel(next, completedInBlock)}
                    </span>
                    <span className="predazzo-dash__next-gender-badge" title={next.gender === 'men' ? 'Mężczyźni' : next.gender === 'women' ? 'Kobiety' : 'Mieszany'}>
                      <GenderIcon gender={next.gender} />
                    </span>
                  </div>
                  <div className="predazzo-dash__next-datetime-weather">
                    <div className="predazzo-dash__next-datetime">
                      <p className="predazzo-dash__next-time">{next.time}</p>
                      <p className="predazzo-dash__next-date">{formatDateWithYear(next.date)}</p>
                    </div>
                    <div className="predazzo-dash__next-temp-block">
                      <span className="predazzo-dash__next-weather-icon" title={getWeatherConditionLabel(weather.condition)}>
                        <NextCardWeatherIcon condition={weather.condition} />
                      </span>
                      <span className="predazzo-dash__next-temp">{weather.tempC} °C</span>
                    </div>
                  </div>
                  <div className="predazzo-dash__next-divider" aria-hidden />
                  <div className="predazzo-dash__next-wind-row">
                    <span className="predazzo-dash__next-wind" title="Wiatr">
                      <WindIcon />
                      {WindLabel({ speed: weather.windMs })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="predazzo-dash__next-btn"
                    onClick={handleGoToNextEvent}
                  >
                    <NextUpIcon />
                    <span>Przejdź</span>
                  </button>
                </section>
              )}
              <div className={resultsAreaClass}>
                {secondaryResult && (
                  <section className="predazzo-dash__results-table predazzo-dash__results-table--secondary">
                    <div className="predazzo-dash__results-header">
                      <div>
                        <h3 className="predazzo-dash__results-table-title">{secondaryTitle}</h3>
                        <div className="predazzo-dash__results-meta-row">
                          <p className="predazzo-dash__results-meta">
                            {eventMetaLabel({ date: secondaryResult.entry.date, time: secondaryResult.entry.time })}
                          </p>
                          <button
                            type="button"
                            className="predazzo-dash__results-details-btn"
                            onClick={() => handleShowDetails(secondaryResult.entry.eventId)}
                          >
                            Zobacz szczegóły
                          </button>
                        </div>
                      </div>
                    </div>
                    {secondaryRows.length > 0 ? (
                      <div className="predazzo-dash__results-table-scroll">
                        <table className="predazzo-dash__results-table-grid" role="grid">
                          <colgroup>
                            <col className="predazzo-dash__results-col-pos" />
                            <col className="predazzo-dash__results-col-name" />
                            <col className="predazzo-dash__results-col-points" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>M.</th>
                              <th>{secondaryResult.entry.gender === 'women' ? 'Zawodniczka' : secondaryResult.entry.gender === 'men' ? 'Zawodnik' : 'Drużyna'}</th>
                              <th>Punkty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {secondaryRows.map((row) => (
                              <tr key={`${secondarySummary?.eventId ?? secondaryResult.entry.eventId}-${row.rank}-${row.label}`}>
                                <td>{row.rank}</td>
                                <td className="predazzo-dash__results-name-cell">
                                  <span className="predazzo-dash__results-flag" aria-hidden>
                                    {countryToFlag(row.country)}
                                  </span>
                                  <span className="predazzo-dash__results-name">{row.label}</span>
                                </td>
                                <td className="predazzo-dash__results-points">{row.points.toFixed(1)} pkt</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="predazzo-dash__results-empty-text">Brak wyników.</p>
                    )}
                  </section>
                )}
                <section className="predazzo-dash__results-table predazzo-dash__results-table--main">
                  {primaryResult ? (
                    <>
                      <div className="predazzo-dash__results-header">
                        <div>
                          <h3 className="predazzo-dash__results-table-title">{primaryTitle}</h3>
                          <div className="predazzo-dash__results-meta-row">
                            <p className="predazzo-dash__results-meta">
                              {eventMetaLabel({ date: primaryResult.entry.date, time: primaryResult.entry.time })}
                            </p>
                            <button
                              type="button"
                              className="predazzo-dash__results-details-btn"
                              onClick={() => handleShowDetails(primaryResult.entry.eventId)}
                            >
                              Zobacz szczegóły
                            </button>
                          </div>
                        </div>
                      </div>
                      {primaryRows.length > 0 ? (
                        <div className="predazzo-dash__results-table-scroll">
                          <table className="predazzo-dash__results-table-grid" role="grid">
                            <colgroup>
                              <col className="predazzo-dash__results-col-pos" />
                              <col className="predazzo-dash__results-col-name" />
                              <col className="predazzo-dash__results-col-points" />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>M.</th>
                                <th>{primaryResult.entry.gender === 'women' ? 'Zawodniczka' : primaryResult.entry.gender === 'men' ? 'Zawodnik' : 'Drużyna'}</th>
                                <th>Punkty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {primaryRows.map((row) => (
                                <tr key={`${primarySummary?.eventId ?? primaryResult.entry.eventId}-${row.rank}-${row.label}`}>
                                  <td>{row.rank}</td>
                                  <td className="predazzo-dash__results-name-cell">
                                    <span className="predazzo-dash__results-flag" aria-hidden>
                                      {countryToFlag(row.country)}
                                    </span>
                                    <span className="predazzo-dash__results-name">{row.label}</span>
                                  </td>
                                  <td className="predazzo-dash__results-points">{row.points.toFixed(1)} pkt</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="predazzo-dash__results-empty-text">Brak wyników.</p>
                      )}
                    </>
                  ) : (
                    <div className="predazzo-dash__results-empty">
                      <p>Nic tu jeszcze nie ma.</p>
                      <p className="predazzo-dash__results-empty-hint">Wyniki pojawią się po zakończeniu pierwszych skoków.</p>
                    </div>
                  )}
                </section>
              </div>
            </aside>
          </div>
        </div>

        <div className="predazzo-dash__view-archive">
          <div className="predazzo-dash__archive-layout">
            <aside className="predazzo-dash__archive-list">
              <h2 className="predazzo-dash__archive-title">&nbsp;</h2>
              {archiveItems.length === 0 && (
                <div className="predazzo-dash__archive-empty">
                  <ArchiveIcon />
                  <p>Brak zapisanych serii.</p>
                </div>
              )}
              {predazzoArchive.length > 0 && (
                <div className="predazzo-dash__archive-section">
                  <h3 className="predazzo-dash__archive-section-title">Konkursy i serie</h3>
                  <ul className="predazzo-dash__archive-entries" role="list">
                    {predazzoArchive.map((entry) => {
                      const medals =
                        entry.type === 'training' || entry.type === 'trial' ? [] : medalistsForEntry(entry);
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className={`predazzo-dash__archive-entry ${entry.id === selectedArchiveId ? 'predazzo-dash__archive-entry--active' : ''}`}
                            onClick={() => setSelectedArchiveId(entry.id)}
                          >
                            <div className="predazzo-dash__archive-entry-main">
                              <span className="predazzo-dash__archive-entry-label">
                                {entryLabelWithHill(entry)}
                              </span>
                              <span className="predazzo-dash__archive-entry-meta">
                                {formatScheduleDate(entry.date)} · {entry.time}
                              </span>
                            </div>
                            {medals.length > 0 && (
                              <div className="predazzo-dash__archive-entry-medals">
                                {medals.map((medal) => (
                                  <span key={`${entry.id}-${medal.rank}`} className="predazzo-dash__archive-medal">
                                    <span className="predazzo-dash__archive-medal-rank" aria-hidden>
                                      {medal.rank === 1 ? '🥇' : medal.rank === 2 ? '🥈' : '🥉'}
                                    </span>
                                    <span className="predazzo-dash__archive-medal-flag" aria-hidden>
                                      {countryToFlag(medal.country)}
                                    </span>
                                    <span className="predazzo-dash__archive-medal-name">{medal.label}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {sapporoArchive.length > 0 && (
                <div className="predazzo-dash__archive-section">
                  <h3 className="predazzo-dash__archive-section-title">Sapporo</h3>
                  <ul className="predazzo-dash__archive-entries" role="list">
                    {sapporoArchive.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className={`predazzo-dash__archive-entry ${entry.id === selectedArchiveId ? 'predazzo-dash__archive-entry--active' : ''}`}
                          onClick={() => setSelectedArchiveId(entry.id)}
                        >
                          <div className="predazzo-dash__archive-entry-main">
                            <span className="predazzo-dash__archive-entry-label">
                              {entry.eventLabel} · {entry.seriesLabel || 'Wyniki'}
                            </span>
                            <span className="predazzo-dash__archive-entry-meta">
                              {entry.day === 'friday' ? 'Piątek' : entry.day === 'saturday' ? 'Sobota' : 'Niedziela'}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
            <main className="predazzo-dash__archive-details">
              {selectedArchive && selectedArchive.source === 'predazzo' && (
                <ArchiveResultsPanel entry={selectedArchive} />
              )}
              {selectedArchive && selectedArchive.source === 'sapporo' && (
                <SapporoArchivePanel entry={selectedArchive} />
              )}
              {!selectedArchive && archiveItems.length === 0 && (
                <div className="predazzo-dash__archive-empty-panel">
                  <p>Wybierz serię, aby zobaczyć szczegóły.</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

function ArchiveResultsPanel({ entry }: { entry: PredazzoArchiveEntry }): JSX.Element {
  const [selectedJumpId, setSelectedJumpId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ id: string; x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hasTeams = entry.type === 'team_mixed' || entry.type === 'team_men_pairs';
  const includeStyle = entry.type !== 'training' && entry.type !== 'trial';
  const scoring = useMemo(() => archiveHillScoring(entry.hill), [entry.hill]);

  useEffect(() => {
    setSelectedJumpId(null);
    setTooltip(null);
  }, [entry.id]);

  const bibById = useMemo(
    () => new Map(entry.results.map((r) => [jumperId(r.jumper), r.bib])),
    [entry.results]
  );
  const teams = useMemo(() => (hasTeams ? buildArchiveTeams(entry.results) : []), [entry.results, hasTeams]);

  const handleSelect = (id: string, e?: MouseEvent<HTMLElement>): void => {
    if (e) e.stopPropagation();
    setSelectedJumpId(id);
    if (e) {
      setTooltip({ id, x: e.clientX + 12, y: e.clientY - 80 });
    }
  };

  const rowDetails = useMemo(
    () => (selectedJumpId ? entry.results.find((r) => r.id === selectedJumpId) ?? null : null),
    [selectedJumpId, entry.results]
  );

  const overallStandings = useMemo(() => {
    if (hasTeams) {
      return buildArchiveTeamStandings(entry.results, teams, entry.totalRounds - 1)
        .sort((a, b) => b.totalPoints - a.totalPoints);
    }
    return buildArchiveIndividualStandings(entry.results, bibById, entry.totalRounds - 1)
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [entry.results, entry.totalRounds, hasTeams, teams, bibById]);

  const rowDetailsPosition = useMemo(() => {
    if (!rowDetails) return null;
    if (hasTeams && rowDetails.teamId) {
      return findTeamPosition(overallStandings as ArchiveTeamStanding[], rowDetails.teamId);
    }
    return findJumperPosition(overallStandings as ArchiveIndividualStanding[], rowDetails.jumper);
  }, [rowDetails, hasTeams, overallStandings]);

  const rowDetailsRoundPosition = useMemo(() => {
    if (!rowDetails) return null;
    const roundResults = entry.results.filter((r) => r.roundIndex === rowDetails.roundIndex);
    if (hasTeams && rowDetails.teamId) {
      const standings = buildArchiveTeamStandings(roundResults, teams, rowDetails.roundIndex)
        .sort((a, b) => b.totalPoints - a.totalPoints);
      return findTeamPosition(standings, rowDetails.teamId);
    }
    const standings = buildArchiveIndividualStandings(roundResults, bibById, rowDetails.roundIndex)
      .sort((a, b) => b.totalPoints - a.totalPoints);
    return findJumperPosition(standings, rowDetails.jumper);
  }, [rowDetails, entry.results, hasTeams, teams, bibById]);

  const rowDetailsGroupPosition = useMemo(() => {
    if (!rowDetails || !hasTeams || rowDetails.slotInTeam == null) return null;
    const groupResults = entry.results.filter(
      (r) => r.roundIndex === rowDetails.roundIndex && r.slotInTeam === rowDetails.slotInTeam
    );
    const standings = buildArchiveTeamStandings(groupResults, teams, rowDetails.roundIndex)
      .sort((a, b) => b.totalPoints - a.totalPoints);
    return findTeamPosition(standings, rowDetails.teamId);
  }, [rowDetails, entry.results, hasTeams, teams]);

  useEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    let nextX = tooltip.x;
    let nextY = tooltip.y;
    if (rect.right > window.innerWidth - 20) {
      nextX = Math.max(16, window.innerWidth - rect.width - 20);
    }
    if (rect.bottom > window.innerHeight - 20) {
      nextY = Math.max(16, window.innerHeight - rect.height - 20);
    }
    if (nextX !== tooltip.x || nextY !== tooltip.y) {
      setTooltip({ ...tooltip, x: nextX, y: nextY });
    }
  }, [tooltip]);

  const rows = useMemo(() => {
    const byId = new Map<string, { jumper: Jumper; r1?: ArchiveJumpResult; r2?: ArchiveJumpResult; total: number }>();
    entry.results.forEach((r) => {
      const id = jumperId(r.jumper);
      const existing = byId.get(id);
      if (existing) {
        existing.total += r.result.points;
        if (r.roundIndex === 0) existing.r1 = r;
        if (r.roundIndex === 1) existing.r2 = r;
      } else {
        byId.set(id, {
          jumper: r.jumper,
          total: r.result.points,
          ...(r.roundIndex === 0 ? { r1: r } : {}),
          ...(r.roundIndex === 1 ? { r2: r } : {}),
        });
      }
    });
    return [...byId.values()].sort((a, b) => b.total - a.total);
  }, [entry.results]);

  const rounds = useMemo(() => [...Array(entry.totalRounds)].map((_, idx) => idx), [entry.totalRounds]);
  const gridTemplate = useMemo(
    () => `minmax(170px, 1fr) repeat(${entry.totalRounds}, minmax(72px, 1fr)) minmax(78px, 1fr)`,
    [entry.totalRounds]
  );

  return (
    <div className="predazzo-dash__archive-panel">
      <header className="predazzo-dash__archive-panel-header">
        <h2>{entryLabelWithHill(entry)}</h2>
        <span aria-hidden />
      </header>
      <div className="predazzo-dash__archive-table">
        {hasTeams ? (
          <div className="competition-screen__team-table">
            {teams
              .map((team) => {
                const teamResults = entry.results.filter((r) => r.teamId === team.id);
                if (teamResults.length === 0) return null;
                const total = teamResults.reduce((acc, r) => acc + r.result.points, 0);
                const roundTotals = rounds.map(
                  (roundIdx) =>
                    teamResults
                      .filter((r) => r.roundIndex === roundIdx)
                      .reduce((acc, r) => acc + r.result.points, 0)
                );
                return { team, teamResults, total, roundTotals };
              })
              .filter((row): row is { team: ArchiveTeamEntry; teamResults: ArchiveJumpResult[]; total: number; roundTotals: number[] } => row != null)
              .sort((a, b) => b.total - a.total)
              .map((row, idx) => (
                <div key={row.team.id} className="competition-screen__team-row">
                  <div className="competition-screen__team-main">
                    <span className="competition-screen__team-pos">{idx + 1}.</span>
                    <span className="competition-screen__team-flag">{countryToFlag(row.team.country)}</span>
                    <span className="competition-screen__team-name">{countryCodeToName(row.team.country)}</span>
                    <span className="competition-screen__team-total">{row.total.toFixed(1)} pkt</span>
                  </div>
                  <div className="competition-screen__team-rounds">
                    {row.roundTotals.map((val, roundIdx) => (
                      <span key={`${row.team.id}-r-${roundIdx}`} className="competition-screen__team-round-chip">
                        R{roundIdx + 1}: {val > 0 ? val.toFixed(1) : '—'}
                      </span>
                    ))}
                  </div>
                  <div className="competition-screen__team-sub">
                    <div
                      className="competition-screen__team-subheader"
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      <span>Skoczek</span>
                      {rounds.map((roundIdx) => (
                        <span key={`${row.team.id}-h-${roundIdx}`} className="competition-screen__team-subheader-cell">
                          R{roundIdx + 1}
                        </span>
                      ))}
                      <span className="competition-screen__team-subheader-cell">Suma</span>
                    </div>
                    {row.team.members.map((m) => {
                      const jumperResults = row.teamResults.filter((r) => jumperId(r.jumper) === jumperId(m));
                      const byRound = rounds.map((roundIdx) =>
                        jumperResults.find((r) => r.roundIndex === roundIdx)
                      );
                      const total = byRound.reduce((acc, r) => acc + (r?.result.points ?? 0), 0);
                      const isSelected = Boolean(selectedJumpId && byRound.some((r) => r?.id === selectedJumpId));
                      return (
                        <div
                          key={jumperId(m)}
                          className={`competition-screen__team-subrow competition-screen__team-subrow--grid ${isSelected ? 'competition-screen__row--selected' : ''}`}
                          style={{ gridTemplateColumns: gridTemplate }}
                        >
                          <span className="competition-screen__team-subname">
                            <span className="competition-screen__flag">{countryToFlag(m.country)}</span>
                            {m.name} {m.surname}
                          </span>
                          {byRound.map((r, roundIdx) => (
                            <span
                              key={`${jumperId(m)}-${roundIdx}`}
                              className={r ? 'competition-screen__cell-clickable competition-screen__team-subvalue' : 'competition-screen__team-subvalue'}
                              onClick={(e) => r && handleSelect(r.id, e)}
                              title={r ? `${r.result.distance.toFixed(1)}m` : undefined}
                            >
                              {r ? r.result.points.toFixed(1) : '—'}
                            </span>
                          ))}
                          <span className="competition-screen__team-subtotal">
                            {total > 0 ? total.toFixed(1) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <table className="competition-screen__table">
            <thead>
              <tr>
                <th>M.</th>
                <th>{entry.gender === 'women' ? 'ZAWODNICZKA' : 'ZAWODNIK'}</th>
                <th>Odległość 1</th>
                <th>Punkty 1</th>
                {entry.totalRounds > 1 && (
                  <>
                    <th>Odległość 2</th>
                    <th>Punkty 2</th>
                    <th>Nota</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isSelected = Boolean(
                  selectedJumpId && (row.r2?.id === selectedJumpId || row.r1?.id === selectedJumpId)
                );
                return (
                  <tr
                    key={jumperId(row.jumper)}
                    className={isSelected ? 'competition-screen__row--selected' : ''}
                    onClick={(e) => {
                      const jumpId = row.r2?.id ?? row.r1?.id;
                      if (jumpId) handleSelect(jumpId, e);
                    }}
                  >
                    <td>{idx + 1}</td>
                    <td className="competition-screen__cell-name">
                      <span className="competition-screen__flag">{countryToFlag(row.jumper.country)}</span>
                      {row.jumper.name} {row.jumper.surname}
                    </td>
                    <td
                      className={row.r1 ? 'competition-screen__cell-clickable' : undefined}
                      onClick={(e) => row.r1 && handleSelect(row.r1.id, e)}
                    >
                      {row.r1 ? `${row.r1.result.distance.toFixed(1)}m` : '—'}
                    </td>
                    <td
                      className={row.r1 ? 'competition-screen__cell-clickable' : undefined}
                      onClick={(e) => row.r1 && handleSelect(row.r1.id, e)}
                    >
                      {row.r1 ? row.r1.result.points.toFixed(1) : '—'}
                    </td>
                    {entry.totalRounds > 1 && (
                      <>
                        <td
                          className={row.r2 ? 'competition-screen__cell-clickable' : undefined}
                          onClick={(e) => row.r2 && handleSelect(row.r2.id, e)}
                        >
                          {row.r2 ? `${row.r2.result.distance.toFixed(1)}m` : '—'}
                        </td>
                        <td
                          className={row.r2 ? 'competition-screen__cell-clickable' : undefined}
                          onClick={(e) => row.r2 && handleSelect(row.r2.id, e)}
                        >
                          {row.r2 ? row.r2.result.points.toFixed(1) : '—'}
                        </td>
                        <td className="competition-screen__cell-total">{row.r1 ? row.total.toFixed(1) : '—'}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {rowDetails && tooltip && tooltip.id === rowDetails.id && (
        <>
          <div
            className="competition-screen__tooltip-backdrop"
            onClick={() => setTooltip(null)}
            aria-hidden
          />
          <div
            className="competition-screen__tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            role="dialog"
            ref={tooltipRef}
          >
            <div className="competition-screen__details-content">
              <div className="competition-screen__details-header">
                <span className="competition-screen__details-name">
                  {countryToFlag(rowDetails.jumper.country)} {rowDetails.jumper.name} {rowDetails.jumper.surname}
                </span>
                <span className="competition-screen__details-bib">{rowDetails.bib}</span>
              </div>
              <div className="competition-screen__details-hero">
                <span>Odległość</span>
                <strong>{rowDetails.result.distance.toFixed(1)} m</strong>
                <span>Miejsce</span>
                <strong>{rowDetailsPosition ?? '—'}</strong>
                <span>Pozycja w rundzie</span>
                <strong>{rowDetailsRoundPosition ?? '—'}</strong>
                {hasTeams && (
                  <>
                    <span>Pozycja w grupie</span>
                    <strong>{rowDetailsGroupPosition ?? '—'}</strong>
                  </>
                )}
                <span>Punkty</span>
                <strong>{rowDetails.result.points.toFixed(1)}</strong>
              </div>
              <div className="competition-screen__details-grid">
                <span>Wiatr (avg)</span>
                <strong className={valColorClass(rowDetails.wind.average, 'wind')}>
                  {rowDetails.wind.average.toFixed(2)} m/s
                </strong>
                <span>Belka</span>
                <strong>
                  {rowDetails.gate}
                  {rowDetails.gateDelta !== 0 && (
                    <span className={`competition-screen__gate-delta competition-screen__gate-delta--${rowDetails.gateDelta > 0 ? 'plus' : 'minus'}`}>
                      {' '}({rowDetails.gateDelta > 0 ? '+' : ''}{rowDetails.gateDelta})
                    </span>
                  )}
                </strong>
                <span>Rek. wiatr</span>
                <strong className={valColorClass(windCompPoints(rowDetails.wind, scoring), 'comp')}>
                  {windCompPoints(rowDetails.wind, scoring).toFixed(1)}
                </strong>
                <span>Rek. belka</span>
                <strong className={valColorClass(-rowDetails.gateCompensationDelta * scoring.pointsPerGate, 'comp')}>
                  {(-rowDetails.gateCompensationDelta * scoring.pointsPerGate).toFixed(1)}
                </strong>
                {includeStyle && (
                  <>
                    <span>Noty</span>
                    <strong>{rowDetails.result.stylePoints != null ? formatStylePoints(rowDetails.result.stylePoints) : '—'}</strong>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SapporoArchivePanel({ entry }: { entry: Extract<ArchiveEntry, { source: 'sapporo' }> }): JSX.Element {
  const dayLabel =
    entry.day === 'friday' ? 'Piątek' : entry.day === 'saturday' ? 'Sobota' : 'Niedziela';
  const step = entry.step;
  const phaseTitle = [dayLabel, entry.eventLabel, entry.seriesLabel].filter(Boolean).join(' · ');
  return (
    <div className="predazzo-dash__archive-panel">
      <header className="predazzo-dash__archive-panel-header">
        <h2>{entry.eventLabel}</h2>
        <span>{phaseTitle}</span>
      </header>
      <div className="predazzo-dash__archive-table">
        {step.kind === 'single' ? (
          <table className="sapporo-results__table" role="grid">
            <thead>
              <tr>
                <th scope="col" className="sapporo-results__cell-pos">M.</th>
                <th scope="col" className="sapporo-results__cell-zawodnik">Zawodnik</th>
                <th scope="col" className="sapporo-results__cell-num">Skok</th>
                <th scope="col" className="sapporo-results__cell-num">Punkty</th>
              </tr>
            </thead>
            <tbody>
              {step.rows.map((row) => (
                <tr key={`${row.bib}-${row.jumperId}`}>
                  <td className="sapporo-results__cell-pos">{row.position}</td>
                  <td className="sapporo-results__cell-zawodnik">
                    <span className="sapporo-results__flag" aria-hidden>
                      {countryToFlag(row.jumperId.split('-')[0] ?? '')}
                    </span>
                    <span className="sapporo-results__jumper-name">{row.jumperId.split('-').slice(1).join(' ')}</span>
                  </td>
                  <td className="sapporo-results__cell-num">{row.distance.toFixed(1)}m</td>
                  <td className="sapporo-results__cell-num">{row.points.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="sapporo-results__table" role="grid">
            <thead>
              <tr>
                <th scope="col" className="sapporo-results__cell-pos">M.</th>
                <th scope="col" className="sapporo-results__cell-bib">BIB</th>
                <th scope="col" className="sapporo-results__cell-zawodnik">Zawodnik</th>
                <th scope="col" className="sapporo-results__cell-num">Skok 1</th>
                <th scope="col" className="sapporo-results__cell-num">Skok 2</th>
                <th scope="col" className="sapporo-results__cell-num">Suma</th>
              </tr>
            </thead>
            <tbody>
              {step.rows.map((row) => (
                <tr key={`${row.bib}-${row.jumperId}`}>
                  <td className="sapporo-results__cell-pos">{row.position}</td>
                  <td className="sapporo-results__cell-bib">{row.bib}</td>
                  <td className="sapporo-results__cell-zawodnik">
                    <span className="sapporo-results__flag" aria-hidden>
                      {countryToFlag(row.jumperId.split('-')[0] ?? '')}
                    </span>
                    <span className="sapporo-results__jumper-name">{row.jumperId.split('-').slice(1).join(' ')}</span>
                  </td>
                  <td className="sapporo-results__cell-num">{row.jump1Distance.toFixed(1)}m</td>
                  <td className="sapporo-results__cell-num">
                    {row.jump2Distance != null ? `${row.jump2Distance.toFixed(1)}m` : '—'}
                  </td>
                  <td className="sapporo-results__cell-num sapporo-results__cell-total">
                    {row.total.toFixed(1)} pkt
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BackIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function TrophyIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function ArchiveIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
