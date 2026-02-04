/**
 * Punktacja skoku (COMPETITIONS.md): 60 pkt + odległość + belka + wiatr + styl.
 */

import type { Wind } from '../simulation/types';
import type { HillScoringParams } from './types';
import type { Landing } from '../simulation/types';
import type { IRandom } from '../simulation/random';

/** Punkty za odległość: 60 + (distance - K) * pointsPerMeter. */
export function distancePoints(
  distance: number,
  kPoint: number,
  params: HillScoringParams
): number {
  const delta = distance - kPoint;
  return 60 + delta * params.pointsPerMeter;
}

/** Punkty za belkę: gateDelta * pointsPerGate (obniżenie = ujemny delta = odejmujemy punkty od odległości, więc dodajemy kompensatę). */
export function gatePoints(gateDelta: number, params: HillScoringParams): number {
  return gateDelta * params.pointsPerGate;
}

/** Punkty za wiatr: dodatni average = wiatr pod narty = dodajemy; ujemny = w plecy = odejmujemy. */
export function windPoints(wind: Wind, params: HillScoringParams): number {
  if (wind.average >= 0) return wind.average * params.windHeadwindPerMs;
  return wind.average * params.windTailwindPerMs;
}

/** Kontekst do not za styl (wzorowane na JudgesSimulator z C#). */
export interface StylePointsContext {
  readonly landing: Landing;
  readonly distance: number;
  readonly realHs: number;
  readonly kPoint: number;
  /** Umiejętność lądowania -3..3 (jak landingSkill 4..10 w C#, 7 = neutral). */
  readonly landingTendency: number;
  readonly random: IRandom;
}

function ensureNoteRange(x: number): number {
  return Math.max(0, Math.min(20, x));
}

/** Losowa korekta bazy noty zależna od rodzaju lądowania (JudgeNoteBaseRandom). */
function judgeNoteBaseRandom(landing: Landing, random: IRandom): number {
  switch (landing) {
    case 'telemark':
      return random.uniform(-0.7, 0.7);
    case 'parallel':
      return random.uniform(-3, -2);
    case 'touchDown':
      return random.uniform(-9, 7);
    case 'fall':
      return random.uniform(-11.5, -8.5);
    default:
      return random.uniform(-9, 7);
  }
}

/** Losowa korekta noty danego sędziego (JudgeNoteSpecificRandom). */
function judgeNoteSpecificRandom(landing: Landing, random: IRandom): number {
  switch (landing) {
    case 'telemark':
      return random.uniform(-0.7, 0.7);
    case 'parallel':
      return random.uniform(-1.5, 1.5);
    case 'touchDown':
      return random.uniform(-2.4, 2.4);
    case 'fall':
      return random.uniform(-2, 2);
    default:
      return random.uniform(-2.4, 2.4);
  }
}

/** Bonus do noty za odległość: dłuższy skok (do 1.01×HS) = wyższa baza (JudgeNoteDistanceBaseBonus). */
function judgeNoteDistanceBonus(distance: number, kPoint: number, realHs: number): number {
  const distanceClampedToHs = Math.min(distance, realHs * 1.01);
  const kMultiplier = 0.25;
  return (distanceClampedToHs - kPoint) / (kPoint * kMultiplier);
}

/** Noty za styl: 5 sędziów 0–20, odrzucamy 2 skrajne, suma 3 środkowych (max 60). Wzorowane na C# JudgesSimulator. */
export function stylePoints(ctx: StylePointsContext): number {
  const { landing, distance, realHs, kPoint, landingTendency, random } = ctx;
  const noteAdditionByOneLandingSkill = 0.3;
  let baseNote = 17.5 + (landingTendency - 0) * noteAdditionByOneLandingSkill;
  baseNote = ensureNoteRange(baseNote);
  baseNote = ensureNoteRange(baseNote + judgeNoteDistanceBonus(distance, kPoint, realHs));
  baseNote = ensureNoteRange(baseNote + judgeNoteBaseRandom(landing, random));

  const notes = Array.from({ length: 5 }, () =>
    ensureNoteRange(baseNote + judgeNoteSpecificRandom(landing, random))
  );
  const sorted = [...notes].sort((a, b) => a - b);
  const sumMiddle = sorted[1]! + sorted[2]! + sorted[3]!;
  return Math.max(0, Math.min(60, sumMiddle));
}

/** Czy w tym rodzaju serii liczą się noty za styl (kwalifikacje i konkursy; nie w treningu/seriach próbnych). */
export function hasStylePoints(kind: 'training' | 'trial' | 'teamTrial' | 'qualification' | 'individual' | 'duet' | 'mixedTeam'): boolean {
  return kind === 'qualification' || kind === 'individual' || kind === 'duet' || kind === 'mixedTeam';
}
