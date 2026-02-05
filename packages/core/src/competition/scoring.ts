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

/** Punkty za belkę: obniżenie belki (ujemny delta) = dodatnia kompensata, podwyższenie = ujemna. */
export function gatePoints(gateDelta: number, params: HillScoringParams): number {
  return -gateDelta * params.pointsPerGate;
}

/** Punkty za wiatr: dodatni average = wiatr pod narty = ujemna kompensata; ujemny = w plecy = dodatnia. */
export function windPoints(wind: Wind, params: HillScoringParams): number {
  if (wind.average >= 0) return -wind.average * params.windHeadwindPerMs;
  return Math.abs(wind.average) * params.windTailwindPerMs;
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
  return Math.max(1, Math.min(20, x));
}

function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

function normalizeNote(x: number): number {
  return roundToHalf(ensureNoteRange(x));
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

export interface StyleNotesResult {
  notes: number[];
  sum: number;
}

function calculateStyleNotes(ctx: StylePointsContext): StyleNotesResult {
  const { landing, distance, realHs, kPoint, landingTendency, random } = ctx;
  const noteAdditionByOneLandingSkill = 0.3;
  let baseNote = 17.5 + (landingTendency - 0) * noteAdditionByOneLandingSkill;
  baseNote = ensureNoteRange(baseNote);
  baseNote = ensureNoteRange(baseNote + judgeNoteDistanceBonus(distance, kPoint, realHs));
  baseNote = ensureNoteRange(baseNote + judgeNoteBaseRandom(landing, random));

  const notes = Array.from({ length: 5 }, () =>
    normalizeNote(baseNote + judgeNoteSpecificRandom(landing, random))
  );
  const sorted = [...notes].sort((a, b) => a - b);
  const sumMiddle = sorted[1]! + sorted[2]! + sorted[3]!;
  /** Noty za styl w rzeczywistości podawane w połówkach (0.5); suma też powinna mieć krok 0.5. */
  const roundedSum = roundToHalf(sumMiddle);
  return { notes, sum: Math.max(0, Math.min(60, roundedSum)) };
}

/** Noty za styl: 5 sędziów 1–20, odrzucamy 2 skrajne, suma 3 środkowych (max 60). Wzorowane na C# JudgesSimulator. */
export function stylePoints(ctx: StylePointsContext): number {
  return calculateStyleNotes(ctx).sum;
}

export function styleNotes(ctx: StylePointsContext): StyleNotesResult {
  return calculateStyleNotes(ctx);
}

/** Czy w tym rodzaju serii liczą się noty za styl (kwalifikacje i konkursy; nie w treningu/seriach próbnych). */
export function hasStylePoints(kind: 'training' | 'trial' | 'teamTrial' | 'qualification' | 'individual' | 'duet' | 'mixedTeam'): boolean {
  return kind === 'qualification' || kind === 'individual' || kind === 'duet' || kind === 'mixedTeam';
}
