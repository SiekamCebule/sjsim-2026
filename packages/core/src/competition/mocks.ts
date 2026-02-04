/**
 * Proste implementacje IWindProvider i IGatePolicy – bez tight couplingu z konkursem.
 * Do użycia np. przy symulacji Sapporo "na raz".
 */

import type { Wind } from '../simulation/types';
import type { IWindProvider } from './IWindProvider';
import type { IGatePolicy } from './IGatePolicy';

/** Stały wiatr (np. z ustawień zawodów). */
export function fixedWindProvider(wind: Wind): IWindProvider {
  return { getWind: () => wind };
}

/** Zawsze ta sama belka (delta 0). */
export const fixedGatePolicy: IGatePolicy = {
  getGate: () => 0,
};

/** Belka ustalona na stałą wartość delta (np. -1 = obniżenie o 1). */
export function constantGatePolicy(gateDelta: number): IGatePolicy {
  return { getGate: () => gateDelta };
}
