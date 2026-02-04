/**
 * Dane i budowa rosteru na weekend Sapporo (powołania + kolejność PŚ).
 * Używane do uruchomienia runSapporoWeekend z @sjsim/core.
 */

import { csvToObjects } from './parseCsv';
import { getMenJumpersAll, type Jumper } from './jumpersData';
import type { SimulationJumper, JumperSkills } from '@sjsim/core';

import menSapporoCallupsRaw from '@assets/men_jumpers_sapporo.csv?raw';
import menWorldCupSapporoRaw from '@assets/men_world_cup_sapporo.csv?raw';

export interface SapporoCallup {
  country: string;
  name: string;
  surname: string;
}

export interface WorldCupEntry {
  position: number;
  country: string;
  name: string;
  surname: string;
}

function jumperKey(c: { country: string; name: string; surname: string }): string {
  return `${c.country}|${c.name}|${c.surname}`;
}

function toSimulationJumper(j: Jumper, id: string): SimulationJumper {
  const skills: JumperSkills = {
    smallHillSkill: j.aSkill ?? 5,
    bigHillSkill: j.bSkill ?? 5,
    landingTendency: j.landing ?? 0,
    form: j.form ?? 5,
    bonusImportantJumps: j.bonusImportantJumps ?? 0,
  };
  return {
    id,
    skills,
    ...(j.gender === 'women' && { isWomen: true }),
  };
}

let _callups: SapporoCallup[] | null = null;
let _worldCup: WorldCupEntry[] | null = null;

export function getSapporoCallups(): SapporoCallup[] {
  if (!_callups) {
    _callups = csvToObjects(menSapporoCallupsRaw, (r) => ({
      country: r.Country ?? '',
      name: r.Name ?? '',
      surname: r.Surname ?? '',
    }));
  }
  return _callups;
}

export function getWorldCupOrderSapporo(): WorldCupEntry[] {
  if (!_worldCup) {
    _worldCup = csvToObjects(menWorldCupSapporoRaw, (r) => ({
      position: parseInt(r.Position ?? '0', 10),
      country: r.Country ?? '',
      name: r.Name ?? '',
      surname: r.Surname ?? '',
    })).filter((x) => x.position > 0);
  }
  return _worldCup;
}

export interface SapporoRosterResult {
  roster: SimulationJumper[];
  worldCupOrderIds: string[];
}

/**
 * Buduje roster (tylko skoczków z powołania, którzy są w men_jumpers_all)
 * i kolejność startową PŚ na Sapporo.
 */
export function buildSapporoRoster(): SapporoRosterResult {
  const callups = getSapporoCallups();
  const all = getMenJumpersAll();
  const worldCupOrder = getWorldCupOrderSapporo();

  const allByKey = new Map<string, Jumper>();
  all.forEach((j) => allByKey.set(jumperKey(j), j));

  const roster: SimulationJumper[] = [];
  const idByKey = new Map<string, string>();

  for (const c of callups) {
    const key = jumperKey(c);
    const j = allByKey.get(key);
    if (!j) continue;
    const id = `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
    idByKey.set(key, id);
    roster.push(toSimulationJumper(j, id));
  }

  const worldCupOrderIds: string[] = [];
  const sorted = [...worldCupOrder].sort((a, b) => b.position - a.position);
  for (const w of sorted) {
    const key = `${w.country}|${w.name}|${w.surname}`;
    const id = idByKey.get(key);
    if (id) worldCupOrderIds.push(id);
  }

  return { roster, worldCupOrderIds };
}
