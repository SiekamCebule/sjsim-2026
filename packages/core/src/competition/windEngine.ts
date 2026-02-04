/**
 * Silnik wiatru (COMPETITIONS.md: "wiatr podczas skoku = bazowy wiatr + RANDOM(zmienność)").
 * Przed każdym skokiem getWind() zwraca nowy losowy wiatr: średnia = baza + los, zmienność = parametr.
 */

import type { Wind } from '../simulation/types';
import type { IWindProvider } from './IWindProvider';
import type { IRandom } from '../simulation/random';

export interface WindEngineParams {
  /** Bazowy wiatr w m/s (dodatni = pod narty, ujemny = w plecy). */
  readonly baseAverage: number;
  /** Odchylenie standardowe wiatru w m/s – przy każdym skoku wiatr = baseAverage + N(0, windVariability). */
  readonly windVariability: number;
}

/**
 * Tworzy IWindProvider, który przy każdym getWind() losuje wiatr:
 * average = baseAverage + gaussian(0, sigma), instability = windVariability.
 * sigma = windVariability (w m/s) — parametr to bezpośrednio odchylenie standardowe.
 */
export function windEngine(
  params: WindEngineParams,
  random: IRandom
): IWindProvider {
  const { baseAverage, windVariability } = params;
  const sigma = windVariability;

  return {
    getWind(): Wind {
      const noise = random.gaussian(0, sigma);
      const average = Math.max(-5, Math.min(5, baseAverage + noise));
      return {
        average,
        instability: windVariability,
      };
    },
  };
}
