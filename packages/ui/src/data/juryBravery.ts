import { JuryBravery } from '@sjsim/core';
import type { ScheduleItem } from './predazzoSchedule';

export const JURY_BRAVERY_LABELS: Record<JuryBravery, string> = {
  [JuryBravery.High]: 'Wysoka',
  [JuryBravery.Medium]: 'Średnia',
  [JuryBravery.Low]: 'Niska',
  [JuryBravery.VeryLow]: 'Bardzo niska',
  [JuryBravery.VeryHigh]: 'Bardzo wysoka',
};

export const JURY_BRAVERY_OPTIONS: JuryBravery[] = [
  JuryBravery.VeryHigh,
  JuryBravery.High,
  JuryBravery.Medium,
  JuryBravery.Low,
  JuryBravery.VeryLow,
];

type BraveryWeight = { bravery: JuryBravery; weight: number };

const TRAINING_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.1 },
  { bravery: JuryBravery.Medium, weight: 0.45 },
  { bravery: JuryBravery.Low, weight: 0.4 },
  { bravery: JuryBravery.VeryLow, weight: 0.05 },
];

const TRIAL_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.05 },
  { bravery: JuryBravery.Medium, weight: 0.3 },
  { bravery: JuryBravery.Low, weight: 0.55 },
  { bravery: JuryBravery.VeryLow, weight: 0.1 },
];

const INDIVIDUAL_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.15 },
  { bravery: JuryBravery.Medium, weight: 0.75 },
  { bravery: JuryBravery.Low, weight: 0.1 },
  { bravery: JuryBravery.VeryLow, weight: 0.0 },
];

const MIXED_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.1 },
  { bravery: JuryBravery.Medium, weight: 0.65 },
  { bravery: JuryBravery.Low, weight: 0.23 },
  { bravery: JuryBravery.VeryLow, weight: 0.02 },
];

function weightsForEvent(event: ScheduleItem): BraveryWeight[] {
  switch (event.type) {
    case 'training':
      return TRAINING_BRAVERY;
    case 'trial':
      return TRIAL_BRAVERY;
    case 'individual':
    case 'team_men_pairs':
      return INDIVIDUAL_BRAVERY;
    case 'team_mixed':
      return MIXED_BRAVERY;
    default:
      return INDIVIDUAL_BRAVERY;
  }
}

export function pickJuryBravery(
  event: ScheduleItem,
  rng: () => number = Math.random
): JuryBravery {
  const weights = weightsForEvent(event);
  const roll = Math.max(0, Math.min(1, rng()));
  let acc = 0;
  for (const entry of weights) {
    acc += entry.weight;
    if (roll <= acc) return entry.bravery;
  }
  return weights[weights.length - 1]!.bravery;
}
