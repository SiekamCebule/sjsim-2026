import type { JumpResult, SeriesResult } from './types';
import type { SimulationJumper } from '../simulation/types';

/**
 * Stan przekazywany do polityki belki (tylko dane – konkurs nie wie, jak belka jest wyliczana).
 */
export interface GatePolicyState {
  /** Numer serii (0-based). */
  readonly seriesIndex: number;
  /** Numer skoku w serii (0-based). */
  readonly jumpIndexInSeries: number;
  /** Belka startowa tej serii. */
  readonly startGate: number;
  /** Wyniki w bieżącej serii (przed tym skokiem). */
  readonly currentSeriesJumps: readonly { jumper: SimulationJumper; result: JumpResult }[];
  /** Wszystkie zakończone serie (pełne wyniki). */
  readonly previousSeries: readonly SeriesResult[];
  /** Skoczek, który ma teraz skakać. */
  readonly nextJumper: SimulationJumper;
  /** Bieżący wiatr (może wpływać na decyzję o belce). */
  readonly currentWind: { average: number; instability: number };
}

/**
 * Polityka belki: zwraca różnicę belki względem belki startowej serii.
 * Konkurs tylko wywołuje getGate(state) – może być stała, auto lub sterowana z zewnątrz.
 */
export interface IGatePolicy {
  /** Delta belki dla następnego skoku (np. 0, -1, -2). */
  getGate(state: GatePolicyState): number;
}
