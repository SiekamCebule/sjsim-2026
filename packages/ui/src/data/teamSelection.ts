import type { SimulationJumper } from '@sjsim/core';
import type { EventResultsSummary } from './eventResults';
import type { Jumper } from './jumpersData';

const SELECTION_K_POINT = 128;

export interface TeamEntry {
  id: string;
  country: string;
  members: Jumper[];
  simMembers: SimulationJumper[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function effectiveSkill(jumper: Jumper, kPoint: number): number {
  const small = jumper.aSkill ?? 5;
  const big = jumper.bSkill ?? 5;
  const t = smoothStep(95, 125, kPoint);
  return lerp(small, big, t);
}

function jumperQuality(jumper: Jumper, kPoint: number): number {
  const form = jumper.form ?? 5;
  const skill = effectiveSkill(jumper, kPoint);
  return skill * 0.7 + form * 0.3;
}

function jumperId(j: Jumper): string {
  return `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
}

function toSimulationJumper(j: Jumper): SimulationJumper {
  return {
    id: jumperId(j),
    skills: {
      smallHillSkill: j.aSkill ?? 5,
      bigHillSkill: j.bSkill ?? 5,
      landingTendency: j.landing ?? 0,
      form: j.form ?? 5,
      bonusImportantJumps: j.bonusImportantJumps ?? 0,
    },
    isWomen: j.gender === 'women',
  };
}

function rankScoreForEvent(
  jumperId: string,
  eventId: string,
  eventResults?: Record<string, EventResultsSummary>
): number | null {
  const event = eventResults?.[eventId];
  if (!event) return null;
  const standing = event.standings.find((s) => s.jumperId === jumperId);
  if (!standing) return null;
  const total = Math.max(1, event.standings.length);
  return (total - standing.rank + 1) / total;
}

function selectionScore(
  jumper: Jumper,
  gender: 'men' | 'women',
  eventResults: Record<string, EventResultsSummary> | undefined,
  includeDuetTraining: boolean,
  trainingWeight: number,
  selectionMode: 'duet' | 'mixed'
): {
  score: number;
  factors: {
    hs141?: number | null;
    hs107?: number | null;
    training?: number | null;
    baseQuality: number;
  };
} {
  const id = jumperId(jumper);
  const hs141Id = gender === 'men' ? '17' : '20';
  const hs107Id = gender === 'men' ? '9' : '5';

  const hs141 = rankScoreForEvent(id, hs141Id, eventResults);
  const hs107 = rankScoreForEvent(id, hs107Id, eventResults);
  const training =
    includeDuetTraining && gender === 'men'
      ? rankScoreForEvent(id, '18', eventResults)
      : null;

  const baseQuality = jumperQuality(jumper, SELECTION_K_POINT) / 100;

  let score = 0;
  const hs141Weight = selectionMode === 'duet' ? 0.4 : 0.0;
  const hs107Weight = selectionMode === 'duet' ? 0.12 : 0.55;
  if (hs141 != null) score += hs141 * hs141Weight;
  if (hs107 != null) score += hs107 * hs107Weight;
  if (training != null) score += training * trainingWeight;
  score += baseQuality * 0.2;
  return {
    score,
    factors: {
      hs141,
      hs107,
      training,
      baseQuality,
    },
  };
}

function selectTopJumpers(
  list: Jumper[],
  gender: 'men' | 'women',
  eventResults: Record<string, EventResultsSummary> | undefined,
  count: number,
  includeDuetTraining: boolean,
  selectionMode: 'duet' | 'mixed'
): Jumper[] | null {
  if (list.length < count) return null;
  let trainingWeight = 0.2;
  if (includeDuetTraining && gender === 'men' && list.length >= 3) {
    const baseScores = list
      .map((jumper) => selectionScore(jumper, gender, eventResults, includeDuetTraining, 0, selectionMode))
      .sort((a, b) => b.score - a.score);
    const margin = baseScores[1] && baseScores[2] ? baseScores[1].score - baseScores[2].score : null;
    if (margin != null && margin <= 0.035) trainingWeight = 0.45;
    if (margin != null && margin <= 0.02) trainingWeight = 0.6;
  }
  const scored = list
    .map((jumper) => {
      const computed = selectionScore(jumper, gender, eventResults, includeDuetTraining, trainingWeight, selectionMode);
      return {
        jumper,
        score: computed.score,
        factors: computed.factors,
      };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((entry) => entry.jumper);
}

export function buildTeamPairs(
  menTeams: Jumper[],
  teamLineups?: Record<string, Jumper[]>,
  eventResults?: Record<string, EventResultsSummary>
): TeamEntry[] {
  const byCountry = new Map<string, Jumper[]>();
  menTeams.forEach((j) => {
    const list = byCountry.get(j.country) ?? [];
    list.push(j);
    byCountry.set(j.country, list);
  });
  const teams: TeamEntry[] = [];
  [...byCountry.entries()].forEach(([country, list]) => {
    const override = teamLineups?.[country]?.filter((j) => j.gender !== 'women') ?? [];
    const members =
      override.length >= 2
        ? [override[0]!, override[1]!]
        : list.length >= 2
          ? selectTopJumpers(list, 'men', eventResults, 2, true, 'duet')
          : null;
    if (!members) return;
    teams.push({
      id: country,
      country,
      members,
      simMembers: [toSimulationJumper(members[0]), toSimulationJumper(members[1])],
    });
  });
  teams.sort((a, b) => a.country.localeCompare(b.country));
  return teams;
}

export function buildMixedTeams(
  menTeams: Jumper[],
  womenTeams: Jumper[],
  teamLineups?: Record<string, Jumper[]>,
  eventResults?: Record<string, EventResultsSummary>,
  allowedJumperIds?: Set<string>
): TeamEntry[] {
  const menByCountry = new Map<string, Jumper[]>();
  const womenByCountry = new Map<string, Jumper[]>();
  menTeams.forEach((j) => {
    const list = menByCountry.get(j.country) ?? [];
    list.push(j);
    menByCountry.set(j.country, list);
  });
  womenTeams.forEach((j) => {
    const list = womenByCountry.get(j.country) ?? [];
    list.push(j);
    womenByCountry.set(j.country, list);
  });
  const teams: TeamEntry[] = [];
  [...menByCountry.keys()].forEach((country) => {
    const menList = menByCountry.get(country) ?? [];
    const womenList = womenByCountry.get(country) ?? [];
    const override = teamLineups?.[country] ?? [];
    const overrideWomen = override.filter((j) => j.gender === 'women');
    const overrideMen = override.filter((j) => j.gender !== 'women');
    const hasOverride = overrideWomen.length >= 2 && overrideMen.length >= 2;
    const bestWomen = womenList.length >= 2 ? selectTopJumpers(womenList, 'women', eventResults, 2, false, 'mixed') : null;
    const bestMen = menList.length >= 2 ? selectTopJumpers(menList, 'men', eventResults, 2, false, 'mixed') : null;
    const members = hasOverride
      ? [overrideWomen[0]!, overrideMen[0]!, overrideWomen[1]!, overrideMen[1]!]
      : bestWomen && bestMen
        ? [bestWomen[0], bestMen[0], bestWomen[1], bestMen[1]]
        : null;
    if (!members) return;
    if (allowedJumperIds && !members.every((m) => allowedJumperIds.has(jumperId(m)))) return;
    teams.push({
      id: country,
      country,
      members,
      simMembers: [
        toSimulationJumper(members[0]),
        toSimulationJumper(members[1]),
        toSimulationJumper(members[2]),
        toSimulationJumper(members[3]),
      ],
    });
  });
  teams.sort((a, b) => a.country.localeCompare(b.country));
  return teams;
}
