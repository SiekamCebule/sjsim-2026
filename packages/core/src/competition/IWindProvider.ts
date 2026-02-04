import type { Wind } from '../simulation/types';

/**
 * Dostawca wiatru na czas skoku.
 * Konkurs wywołuje getWind() przed każdym skokiem – brak tight couplingu z silnikiem wiatru.
 */
export interface IWindProvider {
  getWind(): Wind;
}
