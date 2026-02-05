import type { JumpResult as CoreJumpResult, Wind } from '@sjsim/core';
import type { SapporoSingleSeriesStep, SapporoTwoSeriesStep } from '@sjsim/core';
import type { Jumper } from './jumpersData';
import type { ScheduleItem } from './predazzoSchedule';

export interface ArchiveJumpResult {
  id: string;
  roundIndex: number;
  bib: number;
  jumper: Jumper;
  teamId?: string;
  slotInTeam?: number;
  gate: number;
  gateDelta: number;
  gateDeltaJury: number;
  gateDeltaCoach: number;
  gateCompensationDelta: number;
  wind: Wind;
  result: CoreJumpResult;
  styleNotes: number[] | null;
}

export interface PredazzoArchiveEntry {
  id: string;
  source: 'predazzo';
  eventId: string;
  label: string;
  shortLabel: string;
  type: ScheduleItem['type'];
  gender: ScheduleItem['gender'];
  hill: ScheduleItem['hill'];
  date: string;
  time: string;
  seriesIndex?: number;
  totalRounds: number;
  completedAt: string;
  isMainCompetition?: boolean;
  results: ArchiveJumpResult[];
}

export interface SapporoArchiveEntry {
  id: string;
  source: 'sapporo';
  label: string;
  day: string;
  eventLabel: string;
  seriesLabel: string;
  completedAt: string;
  step: SapporoSingleSeriesStep | SapporoTwoSeriesStep;
}

export type ArchiveEntry = PredazzoArchiveEntry | SapporoArchiveEntry;

export const isPredazzoEntry = (entry: ArchiveEntry): entry is PredazzoArchiveEntry =>
  entry.source === 'predazzo';
