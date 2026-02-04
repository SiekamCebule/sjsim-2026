/**
 * Wybór belki startowej przed konkursem – metoda iteracyjna z symulacją.
 * Czynnik: skłonność do ryzyka (JuryBravery). Auto-belka podczas konkursu osobno.
 */

import type { IJumpSimulator } from '../simulation/IJumpSimulator';
import type { Hill, SimulationContext, SimulationJumper } from '../simulation/types';
import type { IWindProvider } from './IWindProvider';

/** Skłonność jury do ryzyka (dopuszczalna liczba skoków za HS). */
export enum JuryBravery {
  VeryHigh = 'VeryHigh',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  VeryLow = 'VeryLow',
}

/** Dopuszczalny odsetek skoczków, którzy mogą skoczyć za HS (na 50). */
function allowedOvershootsPercent(bravery: JuryBravery): number {
  switch (bravery) {
    case JuryBravery.VeryHigh:
      return 5 / 50;
    case JuryBravery.High:
      return 3 / 50;
    case JuryBravery.Medium:
      return 1 / 50;
    case JuryBravery.Low:
    case JuryBravery.VeryLow:
      return 0 / 50;
    default:
      return 1 / 50;
  }
}

export class MaxTriesExceededError extends Error {
  constructor(
    public readonly maxTries: number,
    message?: string
  ) {
    super(message ?? `Could not find suitable gate after ${maxTries} tries`);
    this.name = 'MaxTriesExceededError';
  }
}

const MAX_TRIES = 50;
const STARTING_GATE = 0;

export interface SelectStartingGateParams {
  readonly simulator: IJumpSimulator;
  readonly windProvider: IWindProvider;
  readonly juryBravery: JuryBravery;
  readonly jumpers: readonly SimulationJumper[];
  readonly hill: Hill;
}

/**
 * Wybiera belkę startową metodą iteracyjną: symuluje skoki przy danej belce,
 * dopuszcza określoną liczbę przekroczeń HS (zależnie od JuryBravery), zwraca wybraną belkę.
 */
export function selectStartingGate(params: SelectStartingGateParams): number {
  const { simulator, windProvider, juryBravery, jumpers, hill } = params;
  const hsPoint = hill.simulationData.realHs;
  const kPoint = hill.simulationData.kPoint;

  let currentGate = STARTING_GATE;
  let tries = 0;

  const allowedShare = allowedOvershootsPercent(juryBravery);
  const allowedOvershoots = Math.floor(jumpers.length * allowedShare);

  function countOvershoots(gate: number): number {
    let count = 0;
    for (const jumper of jumpers) {
      const wind = windProvider.getWind();
      const ctx: SimulationContext = {
        jumper,
        hill,
        gate,
        wind,
        roundKind: 'competition',
      };
      const result = simulator.simulate(ctx);
      if (result.distance > hsPoint) count++;
    }
    return count;
  }

  function someoneJumpedOverHs(gate: number): boolean {
    for (const jumper of jumpers) {
      const wind = windProvider.getWind();
      const ctx: SimulationContext = {
        jumper,
        hill,
        gate,
        wind,
        roundKind: 'competition',
      };
      const result = simulator.simulate(ctx);
      if (result.distance > hsPoint) return true;
    }
    return false;
  }

  let isGoingHigher = !someoneJumpedOverHs(currentGate);

  while (tries < MAX_TRIES) {
    tries++;
    const overshoots = countOvershoots(currentGate);

    if (isGoingHigher) {
      if (overshoots > allowedOvershoots) {
        currentGate--;
        break;
      }
      currentGate++;
    } else {
      if (overshoots <= allowedOvershoots) break;
      currentGate--;
    }
  }

  if (tries >= MAX_TRIES) {
    throw new MaxTriesExceededError(MAX_TRIES);
  }

  switch (juryBravery) {
    case JuryBravery.VeryLow:
      currentGate -= 2;
      break;
    case JuryBravery.Low:
      currentGate -= 1;
      break;
    default:
      break;
  }

  if (kPoint >= 180) currentGate--;

  currentGate--;

  return currentGate;
}
