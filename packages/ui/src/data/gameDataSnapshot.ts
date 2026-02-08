import {
  getMenJumpersAll,
  getWomenJumpersAll,
  getMenTeams,
  getWomenTeams,
  getWorldCupOrderAll,
  getWomenWorldCupOrderAll,
  type Jumper,
} from './jumpersData';
import { PREDAZZO_SCHEDULE, type ScheduleItem } from './predazzoSchedule';

export interface GameDataSnapshot {
  version: number;
  createdAt: string;
  menJumpers: Jumper[];
  womenJumpers: Jumper[];
  menTeams: Jumper[];
  womenTeams: Jumper[];
  menWorldCupOrder: string[];
  womenWorldCupOrder: string[];
  schedule: ScheduleItem[];
}

const SNAPSHOT_VERSION = 1;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

/** Uzupełnia skoczków danymi skilli/formy z listy pełnej (CSV men_jumpers_all / women_jumpers_all). */
function enrichWithSkills(jumpers: Jumper[], fullList: Jumper[]): Jumper[] {
  const byKey = new Map(fullList.map((j) => [jumperKey(j), j]));
  return jumpers.map((j) => {
    const full = byKey.get(jumperKey(j));
    if (!full) return j;
    return {
      ...j,
      aSkill: full.aSkill,
      bSkill: full.bSkill,
      form: full.form,
      landing: full.landing,
      bonusImportantJumps: full.bonusImportantJumps,
    };
  });
}

export const createGameDataSnapshot = (): GameDataSnapshot => ({
  version: SNAPSHOT_VERSION,
  createdAt: new Date().toISOString(),
  menJumpers: clone(getMenJumpersAll()),
  womenJumpers: clone(getWomenJumpersAll()),
  menTeams: clone(getMenTeams()),
  womenTeams: clone(getWomenTeams()),
  menWorldCupOrder: clone(getWorldCupOrderAll()),
  womenWorldCupOrder: clone(getWomenWorldCupOrderAll()),
  schedule: clone(PREDAZZO_SCHEDULE),
});

export const resolveMenJumpers = (snapshot?: GameDataSnapshot | null): Jumper[] => {
  const raw = snapshot?.menJumpers ?? getMenJumpersAll();
  return enrichWithSkills(raw, getMenJumpersAll());
};

export const resolveWomenJumpers = (snapshot?: GameDataSnapshot | null): Jumper[] => {
  const raw = snapshot?.womenJumpers ?? getWomenJumpersAll();
  return enrichWithSkills(raw, getWomenJumpersAll());
};

export const resolveMenTeams = (snapshot?: GameDataSnapshot | null): Jumper[] => {
  const raw = snapshot?.menTeams ?? getMenTeams();
  return enrichWithSkills(raw, getMenJumpersAll());
};

export const resolveWomenTeams = (snapshot?: GameDataSnapshot | null): Jumper[] => {
  const raw = snapshot?.womenTeams ?? getWomenTeams();
  return enrichWithSkills(raw, getWomenJumpersAll());
};

type MenCallupsOverrides = Record<string, Jumper[]>;

function mergeTeamsByCountry(base: Jumper[], overrides: MenCallupsOverrides): Jumper[] {
  const byCountry = new Map<string, Jumper[]>();
  base.forEach((jumper) => {
    const list = byCountry.get(jumper.country) ?? [];
    list.push(jumper);
    byCountry.set(jumper.country, list);
  });
  Object.entries(overrides).forEach(([country, roster]) => {
    if (roster && roster.length > 0) {
      byCountry.set(country, roster);
    }
  });
  return [...byCountry.values()].flat();
}

export const resolveMenTeamsWithCallups = (
  snapshot?: GameDataSnapshot | null,
  options?: {
    allCallups?: MenCallupsOverrides;
    selectedCountry?: string | null;
    selectedJumpers?: Jumper[];
  }
): Jumper[] => {
  const base = resolveMenTeams(snapshot);
  if (options?.allCallups && Object.keys(options.allCallups).length > 0) {
    return mergeTeamsByCountry(base, options.allCallups);
  }
  if (options?.selectedCountry && options.selectedJumpers && options.selectedJumpers.length > 0) {
    return mergeTeamsByCountry(base, { [options.selectedCountry]: options.selectedJumpers });
  }
  return base;
};

export const resolveMenWorldCupOrder = (snapshot?: GameDataSnapshot | null): string[] =>
  snapshot?.menWorldCupOrder ?? getWorldCupOrderAll();

export const resolveWomenWorldCupOrder = (snapshot?: GameDataSnapshot | null): string[] =>
  snapshot?.womenWorldCupOrder ?? getWomenWorldCupOrderAll();

export const resolveSchedule = (snapshot?: GameDataSnapshot | null): ScheduleItem[] =>
  snapshot?.schedule ?? PREDAZZO_SCHEDULE;
