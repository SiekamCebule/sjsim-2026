/**
 * Algorytm automatycznych powołań kadr (CALLUPS.md).
 * Score: pozycja PŚ, wyniki z Sapporo, skill + forma; + los z <-2, 2>.
 */

import type { SapporoWeekendResult } from '@sjsim/core';
import {
  getJumpersByCountry,
  getLimitForCountry,
  getMenCountries,
  getWorldCupOrderAll,
  type Jumper,
} from './jumpersData';

function jumperId(j: Jumper): string {
  return `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
}

/**
 * Punkty Sapporo do score'u powołań:
 * - Tylko konkursy główne (oba „Wyniki końcowe” – sobota + niedziela): pełna waga.
 * - Kwalifikacje (piątek + niedziela): waga 0.2.
 * Treningi i seria próbna nie wchodzą.
 */
function getSapporoPointsByJumper(result: SapporoWeekendResult): Map<string, number> {
  const map = new Map<string, number>();
  const steps = result.steps;
  const QUALI_WEIGHT = 0.2;

  for (const step of steps) {
    if (step.kind === 'two' && step.eventLabel === 'Konkurs indywidualny' && step.seriesLabel === 'Wyniki końcowe') {
      for (const row of step.rows) {
        const prev = map.get(row.jumperId) ?? 0;
        map.set(row.jumperId, prev + row.total);
      }
    }
    if (step.kind === 'single' && step.eventLabel === 'Kwalifikacje') {
      for (const row of step.rows) {
        const prev = map.get(row.jumperId) ?? 0;
        map.set(row.jumperId, prev + QUALI_WEIGHT * row.points);
      }
    }
  }
  return map;
}

/**
 * Pozycja w PŚ (0 = lider). Pełna lista PŚ z men_world_cup.csv.
 * Kogo nie ma na liście (np. nie jeździł w PŚ) – nie karzemy, zwracamy -1 (potem neutral 50).
 */
function wcPosition(jumperId: string, worldCupOrderIds: readonly string[]): number {
  const idx = worldCupOrderIds.indexOf(jumperId);
  return idx >= 0 ? idx : -1;
}

/** Składniki score'u (skale 0–100) + suma. Generalka = PŚ. */
export interface CallupScoreBreakdown {
  total: number;
  generalka: number; // PŚ
  skill: number;
  sapporo: number;
  form: number;
  random: number;
}

const WEIGHT_GENERALKA = 0.39; // PŚ
const WEIGHT_SKILL = 0.39;
const WEIGHT_SAPPORO = 0.12; // było 0.2, −40%
const WEIGHT_FORM = 0.1; // forma ok. 3× mniej niż skill

/** Neutralny składnik Sapporo gdy skoczek nie jechał do Sapporo – nie traci. */
const SAPPORO_NEUTRAL = 50;

/**
 * Score do rankingu powołań (CALLUPS.md):
 * - Generalka (PŚ), skill – główny wpływ.
 * - Sapporo – kto nie jechał, dostaje neutral (nie jest karany).
 * - Forma – ok. 3× mniejszy wpływ niż skill.
 */
function callupScore(
  j: Jumper,
  id: string,
  worldCupOrderIds: readonly string[],
  sapporoPointsByJumper: Map<string, number>,
  randomAdd: number
): CallupScoreBreakdown {
  const pos = wcPosition(id, worldCupOrderIds);
  const generalkaScore = pos >= 0 ? Math.max(0, 100 - pos) : 50; // brak w PŚ = neutral

  const sapporoPts = sapporoPointsByJumper.get(id);
  const sapporoScore =
    sapporoPts === undefined
      ? SAPPORO_NEUTRAL
      : Math.min(100, (sapporoPts / 500) * 100);

  const a = j.aSkill ?? 5;
  const b = j.bSkill ?? 5;
  const form = j.form ?? 5;
  const skillScore = ((a + b) / 2) * 10; // 0–100
  const formScore = form * 10; // 0–100

  const total =
    WEIGHT_GENERALKA * generalkaScore +
    WEIGHT_SKILL * skillScore +
    WEIGHT_SAPPORO * sapporoScore +
    WEIGHT_FORM * formScore +
    randomAdd;

  return {
    total,
    generalka: WEIGHT_GENERALKA * generalkaScore,
    skill: WEIGHT_SKILL * skillScore,
    sapporo: WEIGHT_SAPPORO * sapporoScore,
    form: WEIGHT_FORM * formScore,
    random: randomAdd,
  };
}

/**
 * Zwraca powołania botów dla jednego kraju: N skoczków z najwyższym scorem.
 */
export function computeBotCallupsForCountry(
  country: string,
  sapporoResult: SapporoWeekendResult,
  worldCupOrderIds: readonly string[], // pełny PŚ z getWorldCupOrderAll()
  random: () => number
): Jumper[] {
  const jumpers = getJumpersByCountry(country);
  const limit = Math.min(getLimitForCountry(country), jumpers.length);
  if (limit <= 0) return [];

  const sapporoPointsByJumper = getSapporoPointsByJumper(sapporoResult);

  const withScore = jumpers.map((j) => {
    const id = jumperId(j);
    const randomAdd = (random() - 0.5) * 4; // <-2, 2>
    const breakdown = callupScore(j, id, worldCupOrderIds, sapporoPointsByJumper, randomAdd);
    return { j, breakdown };
  });

  withScore.sort((a, b) => b.breakdown.total - a.breakdown.total);
  const selected = withScore.slice(0, limit);

  if (typeof console !== 'undefined' && console.log) {
    console.log(
      '[SJSIM-CALLUPS]',
      country,
      `(limit ${limit})`,
      withScore.map(({ j, breakdown }, idx) => ({
        name: `${j.name} ${j.surname}`,
        total: breakdown.total.toFixed(2),
        generalka: breakdown.generalka.toFixed(2),
        skill: breakdown.skill.toFixed(2),
        sapporo: breakdown.sapporo.toFixed(2),
        formContrib: breakdown.form.toFixed(2),
        random: breakdown.random.toFixed(2),
        aSkill: j.aSkill,
        bSkill: j.bSkill,
        form: j.form,
        selected: idx < limit,
      }))
    );
  }

  return selected.map((x) => x.j);
}

/**
 * Lista krajów mających skoczków w grze (z limitami na Predazzo).
 */
export function getCountriesForCallups(): string[] {
  return getMenCountries();
}

/**
 * Powołania botów dla wszystkich kadr.
 * worldCupOrderIds = pełny PŚ (getWorldCupOrderAll()), nie lista z Sapporo.
 */
export function computeAllBotCallups(
  sapporoResult: SapporoWeekendResult,
  worldCupOrderIds: readonly string[],
  random: () => number
): Record<string, Jumper[]> {
  const countries = getCountriesForCallups();
  const out: Record<string, Jumper[]> = {};
  for (const country of countries) {
    out[country] = computeBotCallupsForCountry(country, sapporoResult, worldCupOrderIds, random);
  }
  return out;
}
