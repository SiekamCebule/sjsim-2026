import type { SapporoWeekendResult } from '@sjsim/core';
import type { GameConfigState } from '../components/GameConfig';
import type { EventResultsSummary } from './eventResults';
import type { ArchiveEntry } from './archiveTypes';
import type { GameDataSnapshot } from './gameDataSnapshot';

export interface SaveGameState {
  config: GameConfigState | null;
  sapporoResult: SapporoWeekendResult | null;
  completedEventIds: string[];
  trainingBlockProgress: Record<string, number>;
  eventResults: Record<string, EventResultsSummary>;
  gameData: GameDataSnapshot | null;
  autoJumpIntervalMs: number;
  skipPredazzoIntro: boolean;
}

export interface SaveGameMeta {
  location: string;
  summary: string;
  lastPlayed: string;
}

export interface SaveGamePayload {
  version: number;
  updatedAt: string;
  meta: SaveGameMeta;
  state: SaveGameState;
  archiveEntries: ArchiveEntry[];
}

export interface SaveSummary {
  version: number;
  updatedAt: string;
  meta: SaveGameMeta;
  hasSave: boolean;
}
