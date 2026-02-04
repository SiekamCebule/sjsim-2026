import type { Jump, SimulationContext } from './types';

/**
 * Interfejs symulatora skoku (DIP).
 * Pozwala zamienić implementację (prosty, zaawansowany, testowy).
 */
export interface IJumpSimulator {
  simulate(context: SimulationContext): Jump;
}
