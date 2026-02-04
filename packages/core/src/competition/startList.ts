/**
 * Budowanie list startowych: kolejność odwrotna do rankingu, bez punktów PŚ na początku (losowo).
 */
import type { SimulationJumper } from '../simulation/types';
import type { StartListEntry } from './types';
import type { IRandom } from '../simulation/random';

function shuffle<T>(arr: T[], random: IRandom): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = random.randomInt(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Lista startowa: BIB 1 = pierwszy do skoku (najsłabiej w rankingu / bez punktów). */
export function buildIndividualStartList(
  roster: readonly SimulationJumper[],
  worldCupOrder: readonly string[],
  random: IRandom
): StartListEntry[] {
  const byId = new Map(roster.map((j) => [j.id, j]));
  const withPoints = new Set(worldCupOrder);
  const noPoints = roster.filter((j) => !withPoints.has(j.id));
  const noPointsShuffled = shuffle([...noPoints], random);
  const order: SimulationJumper[] = [
    ...noPointsShuffled,
    ...worldCupOrder.map((id) => byId.get(id)!).filter(Boolean),
  ];
  return order.map((jumper, i) => ({ bib: i + 1, jumper }));
}

/** Duety: drużyny w kolejności odwrotnej do Pucharu Narodów. BIB = numer drużyny (1 = pierwsza do skoku). */
export function buildDuetStartList(
  teams: readonly (readonly [SimulationJumper, SimulationJumper])[],
  nationsCupOrder: readonly number[]
): { teamBib: number; jumpers: [SimulationJumper, SimulationJumper] }[] {
  return nationsCupOrder.map((teamIndex, i) => ({
    teamBib: i + 1,
    jumpers: [...teams[teamIndex]!],
  }));
}

/** Drużyny mieszane: jak duety – kolejność odwrotna do sumy Pucharu Narodów. */
export function buildMixedTeamStartList(
  teams: readonly (readonly [SimulationJumper, SimulationJumper, SimulationJumper, SimulationJumper])[],
  nationsCupOrder: readonly number[]
): { teamBib: number; jumpers: readonly [SimulationJumper, SimulationJumper, SimulationJumper, SimulationJumper] }[] {
  return nationsCupOrder.map((teamIndex, i) => ({
    teamBib: i + 1,
    jumpers: teams[teamIndex]!,
  }));
}

/** Team trial: dowolne składy (np. 4 osoby), kolejność drużyn wg nationsCupOrder. */
export function buildTeamTrialStartList(
  teams: readonly (readonly SimulationJumper[])[],
  nationsCupOrder: readonly number[]
): { teamBib: number; jumpers: readonly SimulationJumper[] }[] {
  return nationsCupOrder.map((teamIndex, i) => ({
    teamBib: i + 1,
    jumpers: teams[teamIndex]!,
  }));
}
