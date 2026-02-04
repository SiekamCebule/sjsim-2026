/**
 * Kolejność startowa (COMPETITIONS.md):
 * - Indywidualnie: odwrotna do klasyfikacji PŚ; bez punktów = losowo na początku.
 * - Runda 2 ind.: odwrotna do miejsc po rundzie 1; ex aequo = wyższy BIB później.
 * - Duety/mieszane: odwrotna do Pucharu Narodów; od rundy 2 kolejność po każdej grupie.
 */

import type { SimulationJumper } from '../simulation/types';
import type {
  DuetTeam,
  IndividualStanding,
  MixedTeam,
  StartListEntry,
  TeamStanding,
} from './types';

/** Zawodnik do ustawienia w kolejności (runda 1 indywidualna). */
export interface IndividualEntry {
  readonly jumperId: string;
  readonly jumper: SimulationJumper;
  readonly country: string;
}

/**
 * Lista startowa rundy 1 indywidualnej.
 * Kolejność odwrotna do rankingu (1 = lider); bez punktów (brak w mapie) na początku, losowo.
 */
export function buildIndividualRound1StartList(
  entries: IndividualEntry[],
  ranking: Map<string, number>,
  shuffle: (arr: IndividualEntry[]) => IndividualEntry[] = (a) => [...a]
): StartListEntry[] {
  const noPoints = entries.filter((e) => ranking.get(e.jumperId) == null);
  const withPoints = entries.filter((e) => ranking.get(e.jumperId) != null);
  const sortedNoPoints = shuffle(noPoints);
  const sortedWithPoints = withPoints.sort(
    (a, b) => (ranking.get(b.jumperId) ?? 0) - (ranking.get(a.jumperId) ?? 0)
  );
  const ordered = [...sortedNoPoints, ...sortedWithPoints];
  return ordered.map((e, i) => ({
    bib: i + 1,
    jumper: e.jumper,
    country: e.country,
  }));
}

/**
 * Lista startowa rundy 2+ indywidualnej.
 * Kolejność odwrotna do miejsc; ex aequo = wyższy BIB skacze później.
 * jumperById – mapowanie id → skoczek (awansujący do tej rundy).
 */
export function buildIndividualRoundNStartList(
  standings: IndividualStanding[],
  jumperById: Map<string, SimulationJumper>
): StartListEntry[] {
  const sorted = [...standings].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return a.totalPoints - b.totalPoints;
    return a.bib - b.bib;
  });
  return sorted
    .map((s) => {
      const jumper = jumperById.get(s.jumperId);
      if (!jumper) return null;
      return {
        bib: s.bib,
        jumper,
        country: s.country,
      } as StartListEntry;
    })
    .filter((e): e is StartListEntry => e != null);
}

/** Lista startowa rundy 1 duetów: drużyny w kolejności odwrotnej do rankingu, slot 0 wszyscy, potem slot 1. */
export function buildDuetRound1StartList(
  teams: DuetTeam[],
  ranking: Map<string, number>
): StartListEntry[] {
  const sorted = [...teams].sort(
    (a, b) => (ranking.get(b.teamId) ?? 0) - (ranking.get(a.teamId) ?? 0)
  );
  const list: StartListEntry[] = [];
  const n = sorted.length;
  for (let slot = 0; slot < 2; slot++) {
    for (let i = 0; i < n; i++) {
      const t = sorted[i]!;
      list.push({
        bib: slot * n + i + 1,
        jumper: t.jumpers[slot]!,
        country: t.country,
        teamId: t.teamId,
        slotInTeam: slot,
      });
    }
  }
  return list;
}

/** Jedna grupa w rundzie 2+ duetów: po jednym skoczku z każdej drużyny, kolejność = odwrotna do stanu. */
export function getDuetGroupStartList(
  teams: DuetTeam[],
  teamStandings: TeamStanding[],
  slot: number
): StartListEntry[] {
  const order = [...teamStandings].sort(
    (a, b) => a.totalPoints - b.totalPoints
  );
  const teamById = new Map(teams.map((t) => [t.teamId, t]));
  const list: StartListEntry[] = [];
  order.forEach((st, i) => {
    const t = teamById.get(st.teamId);
    if (!t) return;
    list.push({
      bib: order.length * slot + i + 1,
      jumper: t.jumpers[slot]!,
      country: t.country,
      teamId: t.teamId,
      slotInTeam: slot,
    });
  });
  return list;
}

/** Lista startowa rundy 1 drużyn mieszanych (F M F M). */
export function buildMixedRound1StartList(
  teams: MixedTeam[],
  ranking: Map<string, number>
): StartListEntry[] {
  const sorted = [...teams].sort(
    (a, b) => (ranking.get(b.teamId) ?? 0) - (ranking.get(a.teamId) ?? 0)
  );
  const list: StartListEntry[] = [];
  const n = sorted.length;
  for (let slot = 0; slot < 4; slot++) {
    for (let i = 0; i < n; i++) {
      const t = sorted[i]!;
      list.push({
        bib: slot * n + i + 1,
        jumper: t.jumpers[slot]!,
        country: t.country,
        teamId: t.teamId,
        slotInTeam: slot,
      });
    }
  }
  return list;
}

/** Jedna grupa w rundzie 2+ mieszanej. */
export function getMixedGroupStartList(
  teams: MixedTeam[],
  teamStandings: TeamStanding[],
  slot: number
): StartListEntry[] {
  const order = [...teamStandings].sort(
    (a, b) => a.totalPoints - b.totalPoints
  );
  const teamById = new Map(teams.map((t) => [t.teamId, t]));
  const list: StartListEntry[] = [];
  order.forEach((st, i) => {
    const t = teamById.get(st.teamId);
    if (!t) return;
    list.push({
      bib: order.length * slot + i + 1,
      jumper: t.jumpers[slot]!,
      country: t.country,
      teamId: t.teamId,
      slotInTeam: slot,
    });
  });
  return list;
}
