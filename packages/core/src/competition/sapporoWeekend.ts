/**
 * Symulacja weekendu Sapporo – jedna funkcja zwracająca ustrukturyzowane kroki (seria po serii).
 * Kolejność zgodna z SKI_JUMPING_SCHEDULE.md: piątek 2× trening, kwali; sobota trial, konkurs; niedziela kwali, konkurs.
 */

import type { IRandom } from '../simulation/random';
import type { SimulationJumper } from '../simulation/types';
import { createDefaultRandom } from '../simulation/random';
import { applyFormChangeToRoster, FORM_CHANGE_ALPHA } from '../simulation/formChange';
import { SimpleJumpSimulator } from '../simulation/SimpleJumpSimulator';
import { runEvent } from './runEvent';
import { windEngine } from './windEngine';
import type { IGatePolicy } from './IGatePolicy';
import { HILL_PARAMS } from './hillParams';
import { selectStartingGate, JuryBravery } from './startingGate';
import type { IndividualEventInput, IndividualEventResult, QualificationResult, SeriesResult, SeriesJumpEntry } from './types';
import type { Wind, Landing } from '../simulation/types';

const SAPPORO_HILL = {
  simulationData: {
    kPoint: 123,
    realHs: 137,
    metersByGate: 5.5,
  },
} as const;

const SAPPORO_SCORING = HILL_PARAMS['sapporo-hs137']!;
const GATE_DELTA_RANGE = 12;
const SAPPORO_JURY_BRAVERY = {
  training: JuryBravery.Low,
  qualification: JuryBravery.Low,
  trial: JuryBravery.Medium,
  competition: JuryBravery.High,
};
const BRAVERY_OVERSHOOT_TARGET: Record<JuryBravery, number> = {
  [JuryBravery.VeryLow]: 0.015,
  [JuryBravery.Low]: 0.03,
  [JuryBravery.Medium]: 0.09,
  [JuryBravery.High]: 0.25,
  [JuryBravery.VeryHigh]: 0.4,
};
const BRAVERY_SHORT_TARGET: Record<JuryBravery, number> = {
  [JuryBravery.VeryLow]: 0.45,
  [JuryBravery.Low]: 0.4,
  [JuryBravery.Medium]: 0.35,
  [JuryBravery.High]: 0.3,
  [JuryBravery.VeryHigh]: 0.25,
};

/** Jedna seria: wiersze posortowane wg pozycji (1. miejsce pierwszy). */
export interface SapporoSingleSeriesStep {
  readonly kind: 'single';
  readonly day: 'friday' | 'saturday' | 'sunday';
  readonly eventLabel: string;
  readonly seriesLabel: string;
  readonly gate: number;
  readonly rows: readonly {
    position: number;
    bib: number;
    jumperId: string;
    distance: number;
    points: number;
    gateDelta: number;
    wind: Wind;
    landing: Landing;
    stylePoints?: number;
    styleNotes?: number[];
  }[];
}

/** Dwie serie (np. konkurs): wiersze wg końcowej kolejności, z oboma skokami i sumą. Odpadli w 1. serii mają jump2* = null i miejsce 51., 52., … */
export interface SapporoTwoSeriesStep {
  readonly kind: 'two';
  readonly day: 'friday' | 'saturday' | 'sunday';
  readonly eventLabel: string;
  readonly seriesLabel: string;
  readonly gate1: number;
  readonly gate2: number;
  readonly rows: readonly {
    position: number;
    bib: number;
    jumperId: string;
    jump1Distance: number;
    jump1Points: number;
    jump1: {
      distance: number;
      points: number;
      gateDelta: number;
      wind: Wind;
      landing: Landing;
      stylePoints?: number;
      styleNotes?: number[];
    };
    /** null = odpadł w 1. serii (brak 2. skoku). */
    jump2Distance: number | null;
    jump2Points: number | null;
    jump2: {
      distance: number;
      points: number;
      gateDelta: number;
      wind: Wind;
      landing: Landing;
      stylePoints?: number;
      styleNotes?: number[];
    } | null;
    total: number;
  }[];
}

export type SapporoStep = SapporoSingleSeriesStep | SapporoTwoSeriesStep;

export interface SapporoWeekendResult {
  readonly steps: readonly SapporoStep[];
  /** Roster z formą po niedzielnej zmianie (alfa 0.7) – do użycia przy Predazzo. */
  readonly rosterAfterSunday: SimulationJumper[];
}

function orderByPoints(series: SeriesResult): SeriesJumpEntry[] {
  return [...series.jumps].sort((a, b) => b.result.points - a.result.points);
}

function totalByBibFromSeries(series: readonly SeriesResult[]): number[] {
  const maxBib = Math.max(0, ...series.flatMap((s) => s.jumps.map((j) => j.bib)));
  const total = new Array<number>(maxBib).fill(0);
  for (const s of series) {
    for (const j of s.jumps) {
      total[j.bib - 1] = (total[j.bib - 1] ?? 0) + j.result.points;
    }
  }
  return total;
}

function finalOrderFromSeries(series: readonly SeriesResult[]): number[] {
  const total = totalByBibFromSeries(series);
  const bibs = [...new Set(series.flatMap((s) => s.jumps.map((j) => j.bib)))];
  return bibs.sort((a, b) => (total[b - 1] ?? 0) - (total[a - 1] ?? 0));
}

function toSingleRow(j: SeriesJumpEntry, i: number): {
  position: number;
  bib: number;
  jumperId: string;
  distance: number;
  points: number;
  gateDelta: number;
  wind: Wind;
  landing: Landing;
  stylePoints?: number;
} {
  return {
    position: i + 1,
    bib: j.bib,
    jumperId: j.jumper.id,
    distance: j.result.distance,
    points: j.result.points,
    gateDelta: j.result.gateDelta,
    wind: j.result.wind,
    landing: j.result.landing,
    ...(j.result.stylePoints !== undefined && { stylePoints: j.result.stylePoints }),
    ...(j.result.styleNotes !== undefined && { styleNotes: j.result.styleNotes }),
  };
}

function toJumpDetail(result: SeriesJumpEntry['result'] | undefined): {
  distance: number;
  points: number;
  gateDelta: number;
  wind: Wind;
  landing: Landing;
  stylePoints?: number;
} | null {
  if (!result) return null;
  return {
    distance: result.distance,
    points: result.points,
    gateDelta: result.gateDelta,
    wind: result.wind,
    landing: result.landing,
    ...(result.stylePoints !== undefined && { stylePoints: result.stylePoints }),
    ...(result.styleNotes !== undefined && { styleNotes: result.styleNotes }),
  };
}

function selectGate(
  roster: SimulationJumper[],
  simulator: Parameters<typeof selectStartingGate>[0]['simulator'],
  windProvider: Parameters<typeof selectStartingGate>[0]['windProvider'],
  bravery: JuryBravery = JuryBravery.Medium
): number {
  return selectStartingGate({
    simulator,
    windProvider,
    juryBravery: bravery,
    jumpers: roster,
    hill: SAPPORO_HILL,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createAutoGatePolicy(params: {
  hill: typeof SAPPORO_HILL;
  juryBravery: JuryBravery;
}): IGatePolicy {
  const { hill, juryBravery } = params;
  const kPoint = hill.simulationData.kPoint;
  const realHs = hill.simulationData.realHs;
  const overshootTarget = BRAVERY_OVERSHOOT_TARGET[juryBravery] ?? 0.09;
  const shortTarget = BRAVERY_SHORT_TARGET[juryBravery] ?? 0.35;
  let currentGateDelta = 0;
  let lastSeriesIndex = -1;
  let jumpsSinceChange = 0;

  return {
    getGate(state) {
      if (state.seriesIndex !== lastSeriesIndex) {
        lastSeriesIndex = state.seriesIndex;
        currentGateDelta = 0;
        jumpsSinceChange = 0;
      }

      const recent = state.currentSeriesJumps.slice(-6);
      if (recent.length === 0) {
        jumpsSinceChange += 1;
        return currentGateDelta;
      }

      const hasStyle = recent.some((r) => r.result.stylePoints != null);
      const baseCooldown = hasStyle ? 6 : 4;
      const windCooldownDrop =
        state.currentWind.instability > 0.75 ? 2 :
          state.currentWind.instability > 0.55 ? 1 : 0;
      const minJumpsBetweenChanges = Math.max(2, baseCooldown - windCooldownDrop);
      if (jumpsSinceChange < minJumpsBetweenChanges) {
        jumpsSinceChange += 1;
        return currentGateDelta;
      }

      let overshootCount = 0;
      let shortCount = 0;
      let distanceSum = 0;
      for (const jump of recent) {
        distanceSum += jump.result.distance;
        if (jump.result.distance > realHs) overshootCount += 1;
        if (jump.result.distance < kPoint - 4) shortCount += 1;
      }
      const overshootRatio = overshootCount / recent.length;
      const shortRatio = shortCount / recent.length;
      const avgDistance = distanceSum / recent.length;

      const headwind = state.currentWind.average >= 0.6;
      const tailwind = state.currentWind.average <= -0.6;
      const shouldLower =
        overshootRatio > overshootTarget ||
        avgDistance > realHs - 0.7 ||
        (headwind && avgDistance > realHs - 2);
      const shouldRaise =
        shortRatio > shortTarget ||
        avgDistance < kPoint - 5 ||
        (tailwind && avgDistance < kPoint - 2);

      let nextGateDelta = currentGateDelta;
      if (shouldLower && (!shouldRaise || overshootRatio - overshootTarget >= shortRatio - shortTarget)) {
        const lowerStep =
          overshootRatio > overshootTarget * 2 || avgDistance > realHs + 1.5
            ? 2
            : 1;
        nextGateDelta = clamp(currentGateDelta - lowerStep, -GATE_DELTA_RANGE, GATE_DELTA_RANGE);
      } else if (shouldRaise) {
        const raiseStep =
          shortRatio > shortTarget * 1.8 || avgDistance < kPoint - 8
            ? 2
            : 1;
        nextGateDelta = clamp(currentGateDelta + raiseStep, -GATE_DELTA_RANGE, GATE_DELTA_RANGE);
      }

      if (nextGateDelta !== currentGateDelta) {
        currentGateDelta = nextGateDelta;
        jumpsSinceChange = 0;
        return currentGateDelta;
      }

      jumpsSinceChange += 1;
      return currentGateDelta;
    },
  };
}

export interface RunSapporoWeekendParams {
  readonly roster: SimulationJumper[];
  readonly worldCupOrderIds: readonly string[];
  readonly random?: IRandom;
}

/**
 * Uruchamia pełną symulację weekendu Sapporo i zwraca listę kroków do wyświetlenia (seria po serii).
 * Po sobotnim konkursie stosowana jest zmiana formy (alfa 0.01), po niedzielnym (alfa 0.7).
 */
export function runSapporoWeekend(params: RunSapporoWeekendParams): SapporoWeekendResult {
  const { worldCupOrderIds, random: providedRandom } = params;
  const random = providedRandom ?? createDefaultRandom();
  let rosterState: SimulationJumper[] = [...params.roster];

  const jumpSimulator = new SimpleJumpSimulator(
    {
      // Skille 1–10, forma 0–10 (CSV 1–100 / 0–100 dzielone przez 10). Możesz zmieniać:
      skillImpactFactor: 1.5,           // wpływ różnicy umiejętności
      averageBigSkill: 7,               // „średnia” umiejętność 1–10
      takeoffRatingPointsByForm: 1.5,   // rating wybicia za 1 pt formy (większy = forma bardziej decyduje)
      flightRatingPointsByForm: 1.8,    // rating lotu za 1 pt formy
      randomAdditionsRatio: 0.9,
      distanceSpreadByRatingFactor: 1.2,
      hsFlatteningStartRatio: 0.07,
      hsFlatteningStrength: 1.0,
    },
    random
  );

  const makeBaseWind = (mean: number, dev: number, varMean: number, varDev: number): Wind => ({
    average: random.gaussian(mean, dev),
    instability: random.gaussian(varMean, varDev),
  });
  const makeRunDeps = (baseWind: Wind, juryBravery: JuryBravery) => ({
    jumpSimulator,
    windProvider: windEngine(
      { baseAverage: baseWind.average, windVariability: baseWind.instability },
      random
    ),
    gatePolicy: createAutoGatePolicy({ hill: SAPPORO_HILL, juryBravery }),
    random,
  });
  const hill = SAPPORO_HILL;
  const hillScoring = SAPPORO_SCORING;
  const steps: SapporoStep[] = [];

  // --- Piątek: trening 2 serie ---
  const baseWindTraining = makeBaseWind(1, 0.12, 0.2, 0.025);
  const runDepsTraining = makeRunDeps(baseWindTraining, SAPPORO_JURY_BRAVERY.training);
  const startGateTraining = selectGate(
    rosterState,
    jumpSimulator,
    runDepsTraining.windProvider,
    SAPPORO_JURY_BRAVERY.training
  );
  const trainingResult = runEvent(
    {
      kind: 'training',
      hill,
      hillScoring,
      startGate: startGateTraining,
      windBase: baseWindTraining,
      roster: rosterState,
      worldCupOrder: [...worldCupOrderIds],
      numberOfSeries: 2,
    } as IndividualEventInput,
    runDepsTraining
  );
  if (trainingResult.kind !== 'training') throw new Error('Expected training');
  const trainingS1 = orderByPoints(trainingResult.series[0]!);
  const trainingS2 = orderByPoints(trainingResult.series[1]!);
  steps.push({
    kind: 'single',
    day: 'friday',
    eventLabel: 'Trening',
    seriesLabel: 'Seria 1',
    gate: trainingResult.series[0]!.startGate,
    rows: trainingS1.map((j, i) => toSingleRow(j, i)),
  });
  steps.push({
    kind: 'single',
    day: 'friday',
    eventLabel: 'Trening',
    seriesLabel: 'Seria 2',
    gate: trainingResult.series[1]!.startGate,
    rows: trainingS2.map((j, i) => toSingleRow(j, i)),
  });

  // --- Piątek: kwalifikacje ---
  const baseWindQuali1 = makeBaseWind(0.7, 0.15, 0.18, 0.02);
  const runDepsQuali1 = makeRunDeps(baseWindQuali1, SAPPORO_JURY_BRAVERY.qualification);
  const startGateQuali1 = selectGate(
    rosterState,
    jumpSimulator,
    runDepsQuali1.windProvider,
    SAPPORO_JURY_BRAVERY.qualification
  );
  const quali1Result = runEvent(
    {
      kind: 'qualification',
      hill,
      hillScoring,
      startGate: startGateQuali1,
      windBase: baseWindQuali1,
      roster: rosterState,
      worldCupOrder: [...worldCupOrderIds],
      qualificationAdvance: 50,
    } as IndividualEventInput,
    runDepsQuali1
  ) as QualificationResult;
  const quali1Ordered = orderByPoints(quali1Result.series[0]!);
  steps.push({
    kind: 'single',
    day: 'friday',
    eventLabel: 'Kwalifikacje',
    seriesLabel: '',
    gate: quali1Result.series[0]!.startGate,
    rows: quali1Ordered.map((j, i) => toSingleRow(j, i)),
  });

  const qualifiedBibs1 = quali1Result.qualifiedBibs;
  const qualifiedIds1 = qualifiedBibs1
    .map((bib) => rosterState[bib - 1]?.id)
    .filter((id): id is string => id != null);
  const orderSaturday = [...qualifiedIds1].sort(
    (a, b) => worldCupOrderIds.indexOf(a) - worldCupOrderIds.indexOf(b)
  );
  const rosterSaturday = qualifiedBibs1
    .map((bib) => rosterState[bib - 1])
    .filter((j): j is SimulationJumper => j != null);

  // --- Sobota: seria próbna ---
  const baseWindSaturday = makeBaseWind(1.5, 0.28, 0.23, 0.03);
  const runDepsSaturday = makeRunDeps(baseWindSaturday, SAPPORO_JURY_BRAVERY.trial);
  const startGateTrial = selectGate(
    rosterSaturday,
    jumpSimulator,
    runDepsSaturday.windProvider,
    SAPPORO_JURY_BRAVERY.trial
  );
  const trialResult = runEvent(
    {
      kind: 'trial',
      hill,
      hillScoring,
      startGate: startGateTrial,
      windBase: baseWindSaturday,
      roster: rosterSaturday,
      worldCupOrder: orderSaturday,
    } as IndividualEventInput,
    runDepsSaturday
  );
  if (trialResult.kind !== 'trial') throw new Error('Expected trial');
  const trialOrdered = orderByPoints(trialResult.series[0]!);
  steps.push({
    kind: 'single',
    day: 'saturday',
    eventLabel: 'Seria próbna',
    seriesLabel: '',
    gate: trialResult.series[0]!.startGate,
    rows: trialOrdered.map((j, i) => toSingleRow(j, i)),
  });

  // --- Sobota: konkurs (seria 1, potem wyniki końcowe) ---
  const startGateInd1 = selectGate(
    rosterSaturday,
    jumpSimulator,
    runDepsSaturday.windProvider,
    SAPPORO_JURY_BRAVERY.competition
  );
  const ind1Result = runEvent(
    {
      kind: 'individual',
      hill,
      hillScoring,
      startGate: startGateInd1,
      windBase: baseWindSaturday,
      roster: rosterSaturday,
      worldCupOrder: orderSaturday,
    } as IndividualEventInput,
    runDepsSaturday
  ) as IndividualEventResult;
  const ind1Round1Ordered = orderByPoints(ind1Result.series[0]!);
  steps.push({
    kind: 'single',
    day: 'saturday',
    eventLabel: 'Konkurs indywidualny',
    seriesLabel: 'Seria 1',
    gate: ind1Result.series[0]!.startGate,
    rows: ind1Round1Ordered.map((j, i) => toSingleRow(j, i)),
  });
  const s0 = new Map(ind1Result.series[0]!.jumps.map((j) => [j.bib, j]));
  const s1 = new Map(ind1Result.series[1]!.jumps.map((j) => [j.bib, j]));
  const finalOrderSet = new Set(ind1Result.finalOrder);
  const eliminatedBibs = ind1Result.series[0]!.jumps
    .map((j) => j.bib)
    .filter((bib) => !finalOrderSet.has(bib))
    .sort((a, b) => {
      const pa = ind1Result.series[0]!.jumps.find((j) => j.bib === a)?.result.points ?? 0;
      const pb = ind1Result.series[0]!.jumps.find((j) => j.bib === b)?.result.points ?? 0;
      return pb - pa;
    });
  const rowsQualified = ind1Result.finalOrder.map((bib, idx) => {
    const e0 = s0.get(bib)!;
    const e1 = s1.get(bib)!;
    const r0 = e0?.result;
    const r1 = e1?.result;
    const jump1 = toJumpDetail(r0);
    const jump2 = toJumpDetail(r1);
    return {
      position: idx + 1,
      bib,
      jumperId: e0?.jumper.id ?? e1?.jumper.id ?? `BIB${bib}`,
      jump1Distance: r0?.distance ?? 0,
      jump1Points: r0?.points ?? 0,
      jump1: jump1 ?? {
        distance: 0,
        points: 0,
        gateDelta: 0,
        wind: { average: 0, instability: 0 },
        landing: 'telemark',
      },
      jump2Distance: r1?.distance ?? 0 as number | null,
      jump2Points: r1?.points ?? 0 as number | null,
      jump2: jump2,
      total: ind1Result.totalPointsByBib[bib - 1] ?? 0,
    };
  });
  const rowsEliminated = eliminatedBibs.map((bib, idx) => {
    const e0 = s0.get(bib)!;
    const r0 = e0?.result;
    const jump1 = toJumpDetail(r0);
    return {
      position: ind1Result.finalOrder.length + idx + 1,
      bib,
      jumperId: e0?.jumper.id ?? `BIB${bib}`,
      jump1Distance: r0?.distance ?? 0,
      jump1Points: r0?.points ?? 0,
      jump1: jump1 ?? {
        distance: 0,
        points: 0,
        gateDelta: 0,
        wind: { average: 0, instability: 0 },
        landing: 'telemark',
      },
      jump2Distance: null as number | null,
      jump2Points: null as number | null,
      jump2: null,
      total: r0?.points ?? 0,
    };
  });
  steps.push({
    kind: 'two',
    day: 'saturday',
    eventLabel: 'Konkurs indywidualny',
    seriesLabel: 'Wyniki końcowe',
    gate1: ind1Result.series[0]!.startGate,
    gate2: ind1Result.series[1]!.startGate,
    rows: [...rowsQualified, ...rowsEliminated],
  });

  // Zmiana formy po sobotnim konkursie (FORM_CHANGES.md).
  rosterState = applyFormChangeToRoster(rosterState, FORM_CHANGE_ALPHA.afterSapporoSaturday, random);

  // --- Niedziela: kwalifikacje ---
  const baseWindQuali2 = makeBaseWind(1.98, 0.3, 0.23, 0.028);
  const runDepsQuali2 = makeRunDeps(baseWindQuali2, SAPPORO_JURY_BRAVERY.qualification);
  const startGateQuali2 = selectGate(
    rosterState,
    jumpSimulator,
    runDepsQuali2.windProvider,
    SAPPORO_JURY_BRAVERY.qualification
  );
  const quali2Result = runEvent(
    {
      kind: 'qualification',
      hill,
      hillScoring,
      startGate: startGateQuali2,
      windBase: baseWindQuali2,
      roster: rosterState,
      worldCupOrder: [...worldCupOrderIds],
      qualificationAdvance: 50,
    } as IndividualEventInput,
    runDepsQuali2
  ) as QualificationResult;
  const quali2Ordered = orderByPoints(quali2Result.series[0]!);
  steps.push({
    kind: 'single',
    day: 'sunday',
    eventLabel: 'Kwalifikacje',
    seriesLabel: '',
    gate: quali2Result.series[0]!.startGate,
    rows: quali2Ordered.map((j, i) => toSingleRow(j, i)),
  });

  const qualifiedBibs2 = quali2Result.qualifiedBibs;
  const qualifiedIds2 = qualifiedBibs2
    .map((bib) => rosterState[bib - 1]?.id)
    .filter((id): id is string => id != null);
  const orderSunday = [...qualifiedIds2].sort(
    (a, b) => worldCupOrderIds.indexOf(a) - worldCupOrderIds.indexOf(b)
  );
  const rosterSunday = qualifiedBibs2
    .map((bib) => rosterState[bib - 1])
    .filter((j): j is SimulationJumper => j != null);

  // --- Niedziela: konkurs (seria 1, potem wyniki końcowe) ---
  const baseWindSunday = makeBaseWind(1.98, 0.3, 0.23, 0.028);
  const runDepsSunday = makeRunDeps(baseWindSunday, SAPPORO_JURY_BRAVERY.competition);
  const startGateInd2 = selectGate(
    rosterSunday,
    jumpSimulator,
    runDepsSunday.windProvider,
    SAPPORO_JURY_BRAVERY.competition
  );
  const ind2Result = runEvent(
    {
      kind: 'individual',
      hill,
      hillScoring,
      startGate: startGateInd2,
      windBase: baseWindSunday,
      roster: rosterSunday,
      worldCupOrder: orderSunday,
    } as IndividualEventInput,
    runDepsSunday
  ) as IndividualEventResult;
  const ind2Round1Ordered = orderByPoints(ind2Result.series[0]!);
  steps.push({
    kind: 'single',
    day: 'sunday',
    eventLabel: 'Konkurs indywidualny',
    seriesLabel: 'Seria 1',
    gate: ind2Result.series[0]!.startGate,
    rows: ind2Round1Ordered.map((j, i) => toSingleRow(j, i)),
  });
  const s0sun = new Map(ind2Result.series[0]!.jumps.map((j) => [j.bib, j]));
  const s1sun = new Map(ind2Result.series[1]!.jumps.map((j) => [j.bib, j]));
  const finalOrderSetSun = new Set(ind2Result.finalOrder);
  const eliminatedBibsSun = ind2Result.series[0]!.jumps
    .map((j) => j.bib)
    .filter((bib) => !finalOrderSetSun.has(bib))
    .sort((a, b) => {
      const pa = ind2Result.series[0]!.jumps.find((j) => j.bib === a)?.result.points ?? 0;
      const pb = ind2Result.series[0]!.jumps.find((j) => j.bib === b)?.result.points ?? 0;
      return pb - pa;
    });
  const rowsQualifiedSun = ind2Result.finalOrder.map((bib, idx) => {
    const e0 = s0sun.get(bib)!;
    const e1 = s1sun.get(bib)!;
    const r0 = e0?.result;
    const r1 = e1?.result;
    const jump1 = toJumpDetail(r0);
    const jump2 = toJumpDetail(r1);
    return {
      position: idx + 1,
      bib,
      jumperId: e0?.jumper.id ?? e1?.jumper.id ?? `BIB${bib}`,
      jump1Distance: r0?.distance ?? 0,
      jump1Points: r0?.points ?? 0,
      jump1: jump1 ?? {
        distance: 0,
        points: 0,
        gateDelta: 0,
        wind: { average: 0, instability: 0 },
        landing: 'telemark',
      },
      jump2Distance: (r1?.distance ?? 0) as number | null,
      jump2Points: (r1?.points ?? 0) as number | null,
      jump2: jump2,
      total: ind2Result.totalPointsByBib[bib - 1] ?? 0,
    };
  });
  const rowsEliminatedSun = eliminatedBibsSun.map((bib, idx) => {
    const e0 = s0sun.get(bib)!;
    const r0 = e0?.result;
    const jump1 = toJumpDetail(r0);
    return {
      position: ind2Result.finalOrder.length + idx + 1,
      bib,
      jumperId: e0?.jumper.id ?? `BIB${bib}`,
      jump1Distance: r0?.distance ?? 0,
      jump1Points: r0?.points ?? 0,
      jump1: jump1 ?? {
        distance: 0,
        points: 0,
        gateDelta: 0,
        wind: { average: 0, instability: 0 },
        landing: 'telemark',
      },
      jump2Distance: null as number | null,
      jump2Points: null as number | null,
      jump2: null,
      total: r0?.points ?? 0,
    };
  });
  steps.push({
    kind: 'two',
    day: 'sunday',
    eventLabel: 'Konkurs indywidualny',
    seriesLabel: 'Wyniki końcowe',
    gate1: ind2Result.series[0]!.startGate,
    gate2: ind2Result.series[1]!.startGate,
    rows: [...rowsQualifiedSun, ...rowsEliminatedSun],
  });

  // Zmiana formy po niedzielnym konkursie (FORM_CHANGES.md).
  const rosterAfterSunday = applyFormChangeToRoster(rosterState, FORM_CHANGE_ALPHA.afterSapporoSunday, random);

  return { steps, rosterAfterSunday };
}
