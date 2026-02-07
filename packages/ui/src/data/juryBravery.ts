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

// Treningi (kobiet, mężczyzn): 30% low, 70% veryLow
const TRAINING_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.Low, weight: 0.3 },
  { bravery: JuryBravery.VeryLow, weight: 0.7 },
];

// Seria próbna (kobiet, mężczyzn): 50% low, 50% veryLow
const TRIAL_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.Low, weight: 0.5 },
  { bravery: JuryBravery.VeryLow, weight: 0.5 },
];

// Konkurs indywidualny mężczyzn: 20% high, 75% medium, 5% low
const INDIVIDUAL_MEN_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.2 },
  { bravery: JuryBravery.Medium, weight: 0.75 },
  { bravery: JuryBravery.Low, weight: 0.05 },
];

// Konkurs indywidualny kobiet: 10% high, 60% medium, 30% low
const INDIVIDUAL_WOMEN_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.1 },
  { bravery: JuryBravery.Medium, weight: 0.6 },
  { bravery: JuryBravery.Low, weight: 0.3 },
];

// Konkurs mikstów: 5% high, 60% medium, 35% low
const MIXED_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.05 },
  { bravery: JuryBravery.Medium, weight: 0.6 },
  { bravery: JuryBravery.Low, weight: 0.35 },
];

// Konkurs duetów: 20% high, 75% medium, 5% low
const DUETS_BRAVERY: BraveryWeight[] = [
  { bravery: JuryBravery.High, weight: 0.2 },
  { bravery: JuryBravery.Medium, weight: 0.75 },
  { bravery: JuryBravery.Low, weight: 0.05 },
];

function weightsForEvent(event: ScheduleItem): BraveryWeight[] {
  switch (event.type) {
    case 'training':
      return TRAINING_BRAVERY;
    case 'trial':
      return TRIAL_BRAVERY;
    case 'individual':
      // Rozróżnienie na konkursy kobiet i mężczyzn
      return event.gender === 'women'
        ? INDIVIDUAL_WOMEN_BRAVERY
        : INDIVIDUAL_MEN_BRAVERY;
    case 'team_men_pairs':
      return DUETS_BRAVERY;
    case 'team_mixed':
      return MIXED_BRAVERY;
    default:
      return INDIVIDUAL_MEN_BRAVERY;
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
