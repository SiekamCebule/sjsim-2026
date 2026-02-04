/**
 * Przeliczniki punktacji dla skoczni (COMPETITIONS.md).
 * (za belkę, za wiatr pod narty 1 m/s, za wiatr w plecy 1 m/s)
 */
import type { HillScoringParams } from './types';

export const HILL_PARAMS: Record<string, HillScoringParams> = {
  /** Sapporo HS137 */
  'sapporo-hs137': {
    pointsPerGate: 7.4,
    pointsPerMeter: 1.8,
    windHeadwindPerMs: 10.8,
    windTailwindPerMs: 16.2,
  },
  /** Willingen HS147 */
  'willingen-hs147': {
    pointsPerGate: 7.99,
    pointsPerMeter: 1.8,
    windHeadwindPerMs: 11.7,
    windTailwindPerMs: 17.55,
  },
  /** Predazzo HS107 (normalna) */
  'predazzo-hs107': {
    pointsPerGate: 6,
    pointsPerMeter: 2.0,
    windHeadwindPerMs: 9,
    windTailwindPerMs: 13.5,
  },
  /** Predazzo HS141 */
  'predazzo-hs141': {
    pointsPerGate: 7.2,
    pointsPerMeter: 1.8,
    windHeadwindPerMs: 12.6,
    windTailwindPerMs: 18.9,
  },
};
