import type { SapporoWeekendResult } from '@sjsim/core';
import type { ScheduleItem } from './predazzoSchedule';
import type { SapporoArchiveEntry } from './archiveTypes';

const ROMAN = ['', 'I', 'II', 'III'];

export const formatPredazzoArchiveLabel = (
  event: ScheduleItem,
  seriesIndex?: number
): { label: string; shortLabel: string } => {
  const gender = event.gender === 'men' ? 'mężczyzn' : event.gender === 'women' ? 'kobiet' : 'mieszany';
  if (event.type === 'training') {
    const suffix = seriesIndex ? ` ${ROMAN[seriesIndex] ?? seriesIndex}` : '';
    const label = `Trening ${gender}${suffix}`;
    return { label, shortLabel: label };
  }
  if (event.type === 'trial') {
    return { label: event.label, shortLabel: event.label };
  }
  return { label: event.label, shortLabel: event.label };
};

export const buildSapporoArchiveEntries = (
  result: SapporoWeekendResult,
  completedAt: string
): SapporoArchiveEntry[] => {
  return result.steps
    .filter((step) => step.eventLabel === 'Konkurs indywidualny')
    .map((step, index) => ({
      id: `sapporo-${index}-${completedAt}`,
      source: 'sapporo' as const,
      label: step.eventLabel,
      day: step.day,
      eventLabel: step.eventLabel,
      seriesLabel: step.seriesLabel ?? '',
      completedAt,
      step,
    }));
};
