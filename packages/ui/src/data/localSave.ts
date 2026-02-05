import type { SaveGamePayload, SaveSummary } from './saveTypes';

declare global {
  interface Window {
    sjSimApi?: {
      saveGame: (payload: SaveGamePayload) => Promise<void>;
      loadGame: () => Promise<SaveGamePayload | null>;
      getSaveSummary: () => Promise<SaveSummary | null>;
    };
  }
}

export const saveGame = async (payload: SaveGamePayload): Promise<void> => {
  await window.sjSimApi?.saveGame?.(payload);
};

export const loadGame = async (): Promise<SaveGamePayload | null> =>
  (await window.sjSimApi?.loadGame?.()) ?? null;

export const getSaveSummary = async (): Promise<SaveSummary | null> =>
  (await window.sjSimApi?.getSaveSummary?.()) ?? null;
