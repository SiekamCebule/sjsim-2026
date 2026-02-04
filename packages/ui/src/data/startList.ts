/**
 * Lista startowa treningów i serii próbnych indywidualnych.
 * Szkielet: na razie wszyscy powołani startują, oprócz eventów z EVENT_SKIP_HINTS,
 * gdzie część lepszych (np. Japończyków) może nie wystartować — algorytm do dopracowania.
 */

import type { Jumper } from './jumpersData';
import type { ScheduleItem } from './predazzoSchedule';
import { EVENT_SKIP_HINTS } from './predazzoSchedule';
import { getMenTeams, getWomenTeams, getWorldCupOrderAll, getWomenWorldCupOrderAll } from './jumpersData';

export function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

/** Kolejność startowa: PŚ, potem alfabetycznie. */
function startOrderKey(j: Jumper, wcOrder: string[]): number {
  const id = `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
  const idx = wcOrder.indexOf(id);
  return idx >= 0 ? idx : wcOrder.length + 1;
}

/**
 * Czy ten event ma „niektórzy odpuszczą” / „większość nie skacze”.
 * Służy do szkieletu — na razie zwracamy pusty zbiór skippujących.
 */
export function getSkippedJumperKeys(
  _event: ScheduleItem,
  _allCallups: Record<string, Jumper[]>
): Set<string> {
  const hint = EVENT_SKIP_HINTS[_event.id];
  if (!hint) return new Set();
  // Szkielet: w przyszłości algorytm wybierze np. top N z Japonii / dobrej formy
  // Na razie nikt nie jest pomijany
  return new Set();
}

/**
 * Pełna lista startowa dla treningu/serii próbnej indywidualnej.
 * @param event — event z harmonogramu (training lub trial, gender men/women)
 * @param allCallups — powołania kadr (dla mężczyzn); dla kobiet używamy women teams
 */
export function getStartListForTrainingOrTrial(
  event: ScheduleItem,
  allCallups?: Record<string, Jumper[]>
): Jumper[] {
  const gender = event.gender;
  if (gender === 'mixed') return [];

  const menFromCallups = Object.values(allCallups ?? {}).flat();
  const callups: Jumper[] =
    gender === 'men'
      ? menFromCallups.length > 0
        ? menFromCallups
        : getMenTeams()
      : getWomenTeams();

  const skipped = getSkippedJumperKeys(event, allCallups ?? {});
  const filtered = callups.filter((j) => !skipped.has(jumperKey(j)));

  const wcOrder = gender === 'men' ? getWorldCupOrderAll() : gender === 'women' ? getWomenWorldCupOrderAll() : [];
  filtered.sort((a, b) => {
    if (gender === 'men' || gender === 'women') {
      return startOrderKey(a, wcOrder) - startOrderKey(b, wcOrder);
    }
    return (
      a.country.localeCompare(b.country) ||
      a.surname.localeCompare(b.surname) ||
      a.name.localeCompare(b.name)
    );
  });

  return filtered;
}
