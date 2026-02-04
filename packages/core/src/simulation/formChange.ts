/**
 * Silnik zmiany formy skoczków (FORM_CHANGES.md).
 * Forma 0–10; zmiana z rozkładem o ciężkich ogonach (w stronę Cauchy’ego).
 * Parametr alfa: skala typowej zmiany; rozkład t(2) daje częste „ciche” zmiany i rzadsze duże skoki.
 */

import type { IRandom } from './random';
import type { SimulationJumper, JumperSkills } from './types';

/**
 * Alfy = „siła” zmiany formy w danym momencie gry.
 * Większa alfa → typowa zmiana (mediana |delta|) jest większa.
 *
 * Przykłady kiedy używane:
 * - sapporoGameStart (0.06): start od Sapporo – na starcie każdy dostaje losową zmianę formy
 * - afterSapporoSaturday (0.006): po sobotnim konkursie – delikatna korekta
 * - afterSapporoSunday (0.29): po niedzielnym – duża zmiana przed Igrzyskami
 * - olympicsGameStart (0.08): start od razu od Igrzysk – jedna zmiana na starcie
 */
export const FORM_CHANGE_ALPHA = {
  sapporoGameStart: 0.06,
  afterSapporoSaturday: 0.006,
  afterSapporoSunday: 0.29,
  olympicsGameStart: 0.08,
} as const;

/**
 * Im wyższa / niższa forma, tym mniej „rozjazdu” – skala losowej zmiany jest mniejsza.
 * Forma 5 = pełna skala (100%). Wartości możesz zmieniać w kodzie.
 *
 * Przykłady (przy normalForm = 5):
 * - Forma 0: skala = 1 - reductionAtForm0  → np. 0.1 → skala 90% (mniejsze zmiany)
 * - Forma 5: skala = 100%
 * - Forma 10: skala = 1 - reductionAtForm10 → np. 0.2 → skala 80%
 *
 * Między 0 a 5 i między 5 a 10 skala jest liniowo interpolowana.
 */
export const FORM_CHANGE_SCALE_BY_FORM = {
  /** Przy formie 0: ile obciąć skali (0.1 = 10% mniej → skala 90%). */
  reductionAtForm0: 0.1,
  /** Przy formie 10: ile obciąć skali (0.2 = 20% mniej → skala 80%). */
  reductionAtForm10: 0.2,
  /** Forma, przy której skala = 100% („normalna”). */
  normalForm: 5,
} as const;

/**
 * Tłumienie delty tylko gdy forma idzie w stronę 0 lub 10 (nie przy braku zmiany).
 * NIELINIOWE: tym silniejsze, im bliżej 10 (albo 0). Forma 7–8–9 ma być dużo łatwiejsza niż 10.
 *
 * Używana jest krzywa potęgowa (0 < exponent < 1):
 * - Ruch w GÓRĘ: cel rawTarget w (5, 10]. Znormalizowana odległość x = (rawTarget-5)/5 ∈ (0, 1].
 *   Nowy cel = 5 + 5 * (1 - (1-x)^exponent). Im mniejszy exponent, tym silniejsze tłumienie przy 10.
 * - Ruch w DÓŁ: analogicznie w stronę 0.
 *
 * Przykłady (centerForm=5, exponentTowardHigh=0.5):
 *
 *   Ruch w GÓRĘ:
 *   - rawTarget 6 (x=0.2): 1-(0.8^0.5)≈0.11 → nowy cel ≈ 5.5  (słabe tłumienie, 6 blisko 5)
 *   - rawTarget 7 (x=0.4): 1-(0.6^0.5)≈0.22 → nowy cel ≈ 6.1
 *   - rawTarget 8 (x=0.6): 1-(0.4^0.5)≈0.37 → nowy cel ≈ 6.8
 *   - rawTarget 9 (x=0.8): 1-(0.2^0.5)≈0.55 → nowy cel ≈ 7.8  (7–8–9 względnie łatwe)
 *   - rawTarget 10 (x=1): 1 → nowy cel 10  (samą 10 tylko gdy wylosuje się dokładnie cel 10)
 *
 *   exponent mniejszy (np. 0.35) → jeszcze silniejsze tłumienie przy 9–10 (trudniej dobić do 10).
 *   exponent większy (np. 0.7) → łagodniejsze tłumienie (łatwiej dojść wyżej).
 *
 * Ruch w DÓŁ: to samo w stronę 0 (exponentTowardLow).
 */
export const FORM_DELTA_DAMPENING = {
  /** Środek skali (0–10). Tłumienie przyciąga cele w stronę tej wartości. */
  centerForm: 5,
  /**
   * Wykładnik krzywej w stronę 10. Wartość w (0, 1).
   * Mniejszy = silniejsze tłumienie przy zbliżaniu do 10 (7–8–9 łatwe, 10 trudna).
   * Np. 0.5 → 9 daje ~7.8; 0.35 → mocniejsze tłumienie; 0.7 → łagodniejsze.
   */
  exponentTowardHigh: 0.5,
  /**
   * Wykładnik krzywej w stronę 0. Wartość w (0, 1).
   * Mniejszy = silniejsze tłumienie przy zbliżaniu do 0 (2–3–4 łatwe, 0 trudna).
   */
  exponentTowardLow: 0.5,
} as const;

const FORM_MIN = 0;
const FORM_MAX = 10;

/**
 * Mediana |T| dla t(2) ≈ 0.67 (skalowanie tak, by mediana |delta| ≈ alfa).
 */
const T2_MEDIAN_ABS = 0.67;

/**
 * Zwraca mnożnik skali (0..1) dla danej formy. Używany wewnętrznie: effectiveAlpha = alpha * ten_mnożnik.
 * Przykład: forma 5 → 1.0; forma 9 → ok. 0.84; forma 1 → ok. 0.9 (przy domyślnych FORM_CHANGE_SCALE_BY_FORM).
 */
export function getFormChangeScaleMultiplier(form: number): number {
  const { reductionAtForm0, reductionAtForm10, normalForm } = FORM_CHANGE_SCALE_BY_FORM;
  const f = Math.max(FORM_MIN, Math.min(FORM_MAX, form));
  if (f <= normalForm) {
    const t = (f - FORM_MIN) / (normalForm - FORM_MIN);
    return 1 - reductionAtForm0 + reductionAtForm0 * t;
  }
  const t = (f - normalForm) / (FORM_MAX - normalForm);
  return 1 - reductionAtForm10 * t;
}

/**
 * Losuje zmianę formy (delta). Mediana |delta| ≈ alpha; rozkład t(2) daje czasem duże skoki.
 * Przykład: alpha 0.1 → typowo delta w okolicy ±0.1, ale może wylosować się np. +0.5 lub -0.4.
 */
export function sampleFormDelta(random: IRandom, alpha: number): number {
  const z = random.gaussian(0, 1);
  const e = random.exponential(1);
  if (e <= 0) return 0;
  const t2 = z / Math.sqrt(e);
  return (alpha / T2_MEDIAN_ABS) * t2;
}

/**
 * Tłumi deltę nieliniowo: tym silniej, im bliżej 10 lub 1. Szczegóły: FORM_DELTA_DAMPENING.
 */
function dampenDeltaTowardExtremes(form: number, delta: number): number {
  if (delta === 0) return 0;
  const { centerForm, exponentTowardHigh, exponentTowardLow } = FORM_DELTA_DAMPENING;
  const rawTarget = form + delta;
  const rangeHigh = FORM_MAX - centerForm;
  const rangeLow = centerForm - FORM_MIN;
  let dampenedTarget: number;
  if (delta > 0 && rawTarget > centerForm) {
    const x = Math.min((rawTarget - centerForm) / rangeHigh, 1);
    const compressed = 1 - (1 - x) ** exponentTowardHigh;
    dampenedTarget = centerForm + rangeHigh * compressed;
  } else if (delta < 0 && rawTarget < centerForm) {
    const x = Math.min((centerForm - rawTarget) / rangeLow, 1);
    const compressed = 1 - (1 - x) ** exponentTowardLow;
    dampenedTarget = centerForm - rangeLow * compressed;
  } else {
    return delta;
  }
  return dampenedTarget - form;
}

/**
 * form + delta, z tłumieniem przy ruchu w 0 lub 10 (FORM_DELTA_DAMPENING) i clampem do [0, 10].
 * Gdy delta = 0, zwraca form bez zmian (tłumienie nie działa).
 */
export function applyFormChange(form: number, delta: number): number {
  if (delta === 0) return Math.max(FORM_MIN, Math.min(FORM_MAX, form));
  const d = dampenDeltaTowardExtremes(form, delta);
  const next = form + d;
  return Math.max(FORM_MIN, Math.min(FORM_MAX, next));
}

/**
 * Zwraca nową tablicę skoczków z zaktualizowaną formą (każdy skoczek osobna próbka delta).
 * Skala zmiany zależy od aktualnej formy (FORM_CHANGE_SCALE_BY_FORM).
 */
export function applyFormChangeToRoster(
  roster: readonly SimulationJumper[],
  alpha: number,
  random: IRandom
): SimulationJumper[] {
  return roster.map((j) => {
    const currentForm = j.skills.form;
    const scale = getFormChangeScaleMultiplier(currentForm);
    const effectiveAlpha = alpha * scale;
    const delta = sampleFormDelta(random, effectiveAlpha);
    const newForm = applyFormChange(currentForm, delta);
    const newSkills: JumperSkills = {
      ...j.skills,
      form: newForm,
    };
    return { ...j, skills: newSkills };
  });
}
