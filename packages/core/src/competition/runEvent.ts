/**
 * Rozgrywanie zawodów: treningi, serie próbne, kwalifikacje, indywidualne, duety, mieszane.
 * Konkurs tylko wywołuje windProvider.getWind() i gatePolicy.getGate(state) – brak tight couplingu.
 */

import type { IJumpSimulator } from '../simulation/IJumpSimulator';
import type { SimulationContext, RoundKind, Wind } from '../simulation/types';
import type { IRandom } from '../simulation/random';
import type { IWindProvider } from './IWindProvider';
import type { IGatePolicy } from './IGatePolicy';
import type {
  EventInput,
  EventResult,
  IndividualEventInput,
  DuetEventInput,
  MixedTeamEventInput,
  TeamTrialEventInput,
  SeriesResult,
  SeriesJumpEntry,
  JumpResult,
  StartListEntry,
} from './types';
import * as scoring from './scoring';
import { buildIndividualStartList } from './startList';
import { buildDuetStartList, buildMixedTeamStartList, buildTeamTrialStartList } from './startList';

export interface RunEventDeps {
  readonly jumpSimulator: IJumpSimulator;
  readonly windProvider: IWindProvider;
  readonly gatePolicy: IGatePolicy;
  readonly random: IRandom;
}

function resolveStartGate(
  input: { startGate: EventInput['startGate'] },
  seriesIndex: number
): number {
  const sg = input.startGate;
  return typeof sg === 'function' ? sg(seriesIndex) : sg;
}

function roundKindForSimulation(
  kind: EventInput['kind']
): RoundKind {
  switch (kind) {
    case 'training':
    case 'trial':
    case 'teamTrial':
      return 'training';
    case 'qualification':
      return 'qualification';
    case 'individual':
    case 'duet':
    case 'mixedTeam':
      return 'competition';
    default:
      return 'competition';
  }
}

function runOneJump(
  entry: StartListEntry,
  hill: EventInput['hill'],
  hillScoring: EventInput['hillScoring'],
  startGate: number,
  kind: EventInput['kind'],
  currentSeriesJumps: { jumper: import('../simulation/types').SimulationJumper; result: JumpResult }[],
  previousSeries: SeriesResult[],
  deps: RunEventDeps
): JumpResult {
  const wind = deps.windProvider.getWind();
  const gateDelta = deps.gatePolicy.getGate({
    seriesIndex: previousSeries.length,
    jumpIndexInSeries: currentSeriesJumps.length,
    startGate,
    currentSeriesJumps: [...currentSeriesJumps],
    previousSeries,
    nextJumper: entry.jumper,
    currentWind: wind,
  });

  const effectiveGate = startGate + gateDelta;

  const context: SimulationContext = {
    jumper: entry.jumper,
    hill: { simulationData: hill.simulationData },
    gate: effectiveGate,
    wind,
    roundKind: roundKindForSimulation(kind),
  };
  const jump = deps.jumpSimulator.simulate(context);
  const kPoint = hill.simulationData.kPoint;
  const realHs = hill.simulationData.realHs;

  let points =
    scoring.distancePoints(jump.distance, kPoint, hillScoring) +
    scoring.gatePoints(gateDelta, hillScoring) +
    scoring.windPoints(wind, hillScoring);

  let stylePoints: number | undefined;
  let styleNotes: number[] | undefined;
  if (scoring.hasStylePoints(kind)) {
    const styleResult = scoring.styleNotes({
      landing: jump.landing,
      distance: jump.distance,
      realHs,
      kPoint,
      landingTendency: entry.jumper.skills.landingTendency,
      random: deps.random,
    });
    stylePoints = styleResult.sum;
    styleNotes = styleResult.notes;
    points += stylePoints;
  }
  points = Math.max(0, points);

  const result: JumpResult = {
    distance: jump.distance,
    landing: jump.landing,
    points,
    gateDelta,
    wind,
    ...(stylePoints !== undefined && { stylePoints }),
    ...(styleNotes !== undefined && { styleNotes }),
  };
  return result;
}

/** Ex aequo: później skacze wyższy BIB (COMPETITIONS). */
function orderByTotalThenBib(
  totalByBib: number[],
  bibs: number[]
): number[] {
  return [...bibs].sort((a, b) => {
    const diff = (totalByBib[b - 1] ?? 0) - (totalByBib[a - 1] ?? 0);
    if (diff !== 0) return diff;
    return b - a;
  });
}

export function runEvent(input: EventInput, deps: RunEventDeps): EventResult {
  if (
    input.kind === 'training' ||
    input.kind === 'trial' ||
    input.kind === 'qualification' ||
    input.kind === 'individual'
  ) {
    return runIndividualOrTraining(input as IndividualEventInput, deps);
  }
  if (input.kind === 'duet') {
    return runDuet(input as DuetEventInput, deps);
  }
  if (input.kind === 'mixedTeam') {
    return runMixedTeam(input as MixedTeamEventInput, deps);
  }
  if (input.kind === 'teamTrial') {
    return runTeamTrial(input as TeamTrialEventInput, deps);
  }
  throw new Error(`Unknown event kind: ${(input as EventInput).kind}`);
}

function runIndividualOrTraining(
  input: IndividualEventInput,
  deps: RunEventDeps
): EventResult {
  const { hill, hillScoring, worldCupOrder, roster } = input;
  const numSeries =
    input.kind === 'training'
      ? input.numberOfSeries ?? 1
      : input.kind === 'trial' || input.kind === 'qualification'
        ? 1
        : 2;
  const qualificationAdvance = input.kind === 'qualification' ? (input.qualificationAdvance ?? 50) : 0;

  const startList = buildIndividualStartList(roster, worldCupOrder, deps.random);
  const seriesResults: SeriesResult[] = [];
  let currentOrder = startList.map((e) => e.bib);
  let totalByBib = new Array(startList.length).fill(0) as number[];
  let globalJumpIndex = 0;

  for (let s = 0; s < numSeries; s++) {
    const startGate = resolveStartGate(input, s);
    const currentSeriesJumps: { jumper: import('../simulation/types').SimulationJumper; result: JumpResult }[] = [];
    const entriesInThisSeries = currentOrder.map(
      (bib) => startList.find((e) => e.bib === bib)!
    );

    for (const entry of entriesInThisSeries) {
      const result = runOneJump(
        entry,
        hill,
        hillScoring,
        startGate,
        input.kind,
        currentSeriesJumps,
        seriesResults,
        deps
      );
      if ((globalJumpIndex % 50) < 3) {
        const form = entry.jumper.skills?.form;
        console.log('[SJSIM]', {
          jumpIndex: globalJumpIndex,
          kind: input.kind,
          series: s + 1,
          bib: entry.bib,
          jumperId: entry.jumper.id,
          form,
          distance: result.distance,
          points: result.points.toFixed(1),
          gate: startGate + result.gateDelta,
          wind: result.wind?.average != null ? result.wind.average.toFixed(2) : '-',
          landing: result.landing,
          stylePoints: result.stylePoints != null ? result.stylePoints.toFixed(1) : '-',
        });
      }
      globalJumpIndex++;
      currentSeriesJumps.push({ jumper: entry.jumper, result });
      const idx = entry.bib - 1;
      totalByBib[idx] = (totalByBib[idx] ?? 0) + result.points;
    }

    seriesResults.push({
      jumps: currentSeriesJumps.map((x, i) => ({
        bib: entriesInThisSeries[i]!.bib,
        jumper: x.jumper,
        result: x.result,
      })),
      startGate,
    });

    if (input.kind === 'qualification' && s === 0) {
      const order = orderByTotalThenBib(totalByBib, currentOrder);
      const advance = Math.min(qualificationAdvance, order.length);
      let cut = advance;
      while (cut < order.length && (totalByBib[order[cut]! - 1] ?? 0) === (totalByBib[order[advance - 1]! - 1] ?? 0)) cut++;
      return {
        kind: 'qualification',
        series: seriesResults,
        qualifiedBibs: order.slice(0, cut).map((bib) => bib),
        totalPointsByBib: totalByBib,
      };
    }

    if (input.kind === 'individual' && s === 0) {
      const order = orderByTotalThenBib(totalByBib, currentOrder);
      const top30 = order.slice(0, 30);
      currentOrder = [...top30].reverse();
    }

    if (input.kind === 'training' && s < numSeries - 1) {
      const order = orderByTotalThenBib(totalByBib, currentOrder);
      currentOrder = order.reverse();
    }
  }

  if (input.kind === 'training' || input.kind === 'trial') {
    return {
      kind: input.kind,
      series: seriesResults,
    };
  }

  const finalOrder = orderByTotalThenBib(totalByBib, currentOrder);
  return {
    kind: 'individual',
    series: seriesResults,
    finalOrder,
    totalPointsByBib: totalByBib,
  };
}

/** Duety: 3 serie, 12 → 8. W każdej serii 2 grupy (pierwszy skoczek każdej drużyny, drugi skoczek). Kolejność w serii 2 i 3 = odwrotna do stanu. */
function runDuet(input: DuetEventInput, deps: RunEventDeps): EventResult {
  const { hill, hillScoring, teams, nationsCupOrder } = input;
  const teamList = buildDuetStartList(teams, nationsCupOrder);
  const numTeams = teamList.length;
  const seriesResults: SeriesResult[] = [];
  let teamTotals = new Array(numTeams).fill(0) as number[];
  const teamJumpResultsBySlot: JumpResult[][] = teamList.map(() => []);
  let advancingIndices = teamList.map((_, i) => i);

  for (let seriesIndex = 0; seriesIndex < 3; seriesIndex++) {
    const startGate = resolveStartGate(input, seriesIndex);
    if (seriesIndex === 1) {
      const order = [...advancingIndices].sort(
        (a, b) => teamTotals[b]! - teamTotals[a]!
      );
      advancingIndices = order.slice(0, 12);
    } else if (seriesIndex === 2) {
      const order = [...advancingIndices].sort(
        (a, b) => teamTotals[b]! - teamTotals[a]!
      );
      advancingIndices = order.slice(0, 8);
    }

    const jumpsInSeries: SeriesJumpEntry[] = [];

    for (let group = 0; group < 2; group++) {
      const orderForGroup =
        seriesIndex === 0
          ? advancingIndices
          : [...advancingIndices].sort(
            (a, b) => teamTotals[b]! - teamTotals[a]!
          );

      const currentSeriesJumps: { jumper: import('../simulation/types').SimulationJumper; result: JumpResult }[] = jumpsInSeries.map((j) => ({ jumper: j.jumper, result: j.result }));

      for (const teamSlot of orderForGroup) {
        const teamEntry = teamList[teamSlot]!;
        const jumper = teamEntry.jumpers[group]!;
        const bib = teamSlot + 1;

        const result = runOneJump(
          { bib, jumper },
          hill,
          hillScoring,
          startGate,
          'duet',
          currentSeriesJumps,
          seriesResults,
          deps
        );
        currentSeriesJumps.push({ jumper, result });
        jumpsInSeries.push({ bib, jumper, result });
        teamJumpResultsBySlot[teamSlot]!.push(result);
        teamTotals[teamSlot] = (teamTotals[teamSlot] ?? 0) + result.points;
      }
    }

    seriesResults.push({ jumps: jumpsInSeries, startGate });
  }

  const finalOrder = [...advancingIndices].sort(
    (a, b) => teamTotals[b]! - teamTotals[a]!
  );
  return {
    kind: 'duet',
    series: seriesResults,
    finalOrder: finalOrder.map((i) => i + 1),
    totalPointsByTeamIndex: finalOrder.map((slot) => teamTotals[slot]!),
    teamJumpResults: finalOrder.map((slot) => teamJumpResultsBySlot[slot]!),
  };
}

/** Drużyny mieszane: 2 rundy, 4 grupy na rundę (W, M, W, M). Po każdej grupie aktualizacja kolejności. */
function runMixedTeam(input: MixedTeamEventInput, deps: RunEventDeps): EventResult {
  const { hill, hillScoring, teams, nationsCupOrder } = input;
  const teamList = buildMixedTeamStartList(teams, nationsCupOrder);
  const numTeams = teamList.length;
  const seriesResults: SeriesResult[] = [];
  let teamTotals = new Array(numTeams).fill(0) as number[];
  const teamJumpResultsBySlot: JumpResult[][] = teamList.map(() => []);

  for (let seriesIndex = 0; seriesIndex < 2; seriesIndex++) {
    const startGate = resolveStartGate(input, seriesIndex);
    const jumpsInSeries: SeriesJumpEntry[] = [];

    for (let group = 0; group < 4; group++) {
      const orderForGroup =
        seriesIndex === 0 && group === 0
          ? teamList.map((_, i) => i)
          : [...Array(numTeams)].map((_, i) => i).sort((a, b) => teamTotals[b]! - teamTotals[a]!);

      const currentSeriesJumps: { jumper: import('../simulation/types').SimulationJumper; result: JumpResult }[] = jumpsInSeries.map((j) => ({ jumper: j.jumper, result: j.result }));

      for (const teamSlot of orderForGroup) {
        const teamEntry = teamList[teamSlot]!;
        const jumper = teamEntry.jumpers[group]!;
        const bib = teamSlot + 1;

        const result = runOneJump(
          { bib, jumper },
          hill,
          hillScoring,
          startGate,
          'mixedTeam',
          currentSeriesJumps,
          seriesResults,
          deps
        );
        currentSeriesJumps.push({ jumper, result });
        jumpsInSeries.push({ bib, jumper, result });
        teamJumpResultsBySlot[teamSlot]!.push(result);
        teamTotals[teamSlot] = (teamTotals[teamSlot] ?? 0) + result.points;
      }
    }

    seriesResults.push({ jumps: jumpsInSeries, startGate });
  }

  const finalOrder = [...Array(numTeams)]
    .map((_, i) => i)
    .sort((a, b) => teamTotals[b]! - teamTotals[a]!);
  return {
    kind: 'mixedTeam',
    series: seriesResults,
    finalOrder: finalOrder.map((i) => i + 1),
    totalPointsByTeamIndex: finalOrder.map((slot) => teamTotals[slot]!),
    teamJumpResults: finalOrder.map((slot) => teamJumpResultsBySlot[slot]!),
  };
}

/** Seria próbna drużynowa: jedna seria, każdy skoczek raz, sumy drużynowe. */
function runTeamTrial(input: TeamTrialEventInput, deps: RunEventDeps): EventResult {
  const { hill, hillScoring } = input;
  const teamList = buildTeamTrialStartList(input.teams, input.nationsCupOrder);
  const startGate = resolveStartGate(input, 0);
  const jumpsInSeries: SeriesJumpEntry[] = [];
  const teamTotals: number[] = teamList.map(() => 0);
  let bib = 0;
  const currentSeriesJumps: { jumper: import('../simulation/types').SimulationJumper; result: JumpResult }[] = [];

  for (const teamEntry of teamList) {
    for (const jumper of teamEntry.jumpers) {
      bib++;
      const result = runOneJump(
        { bib, jumper },
        hill,
        hillScoring,
        startGate,
        'teamTrial',
        currentSeriesJumps,
        [],
        deps
      );
      currentSeriesJumps.push({ jumper, result });
      jumpsInSeries.push({ bib, jumper, result });
      const teamIdx = teamList.indexOf(teamEntry);
      teamTotals[teamIdx] = (teamTotals[teamIdx] ?? 0) + result.points;
    }
  }

  return {
    kind: 'teamTrial',
    series: [{ jumps: jumpsInSeries, startGate }],
    teamTotals,
  };
}
