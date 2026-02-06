import path from 'node:path';
import { app } from 'electron';
import Database from 'better-sqlite3';

const DB_FILENAME = 'sjsim-archive.sqlite';

export interface SaveGamePayload {
  version: number;
  updatedAt: string;
  meta: {
    location: string;
    summary: string;
    lastPlayed: string;
  };
  state: unknown;
  archiveEntries: {
    id: string;
    source: string;
    results?: { id: string }[];
  }[];
}

export interface SaveSummary {
  version: number;
  updatedAt: string;
  meta: {
    location: string;
    summary: string;
    lastPlayed: string;
  };
  hasSave: boolean;
}

let db: Database.Database | null = null;

interface SaveStateRow {
  version: number;
  updated_at: string;
  meta_json: string;
  state_json: string;
}

interface ArchiveEntryRow {
  id: string;
  payload_json: string;
}

interface ArchiveJumpRow {
  entry_id: string;
  payload_json: string;
}

const getDb = (): Database.Database => {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), DB_FILENAME);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS save_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      state_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS archive_entries (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS archive_jumps (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      sort_index INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(entry_id) REFERENCES archive_entries(id) ON DELETE CASCADE
    );
  `);
  return db;
};

export const saveGame = (payload: SaveGamePayload): void => {
  const database = getDb();
  const txn = database.transaction(() => {
    database.exec('DELETE FROM save_state; DELETE FROM archive_entries; DELETE FROM archive_jumps;');

    const metaJson = JSON.stringify(payload.meta ?? {});
    const stateJson = JSON.stringify(payload.state ?? {});
    const insertSave = database.prepare(
      'INSERT INTO save_state (id, version, updated_at, meta_json, state_json) VALUES (1, ?, ?, ?, ?)'
    );
    insertSave.run(payload.version ?? 1, payload.updatedAt ?? new Date().toISOString(), metaJson, stateJson);

    const insertEntry = database.prepare(
      'INSERT INTO archive_entries (id, source, completed_at, payload_json) VALUES (?, ?, ?, ?)'
    );
    const insertJump = database.prepare(
      'INSERT INTO archive_jumps (id, entry_id, sort_index, payload_json) VALUES (?, ?, ?, ?)'
    );

    payload.archiveEntries?.forEach((entry) => {
      const { results, ...entryMeta } = entry as Record<string, unknown>;
      insertEntry.run(
        String(entry.id),
        String(entry.source ?? 'predazzo'),
        String((entry as Record<string, unknown>).completedAt ?? payload.updatedAt),
        JSON.stringify(entryMeta)
      );
      if (Array.isArray(results)) {
        results.forEach((jump, jumpIdx) => {
          // Use sort index for uniqueness; jump.id can repeat in team rounds.
          const jumpId = `${entry.id}-${jumpIdx}`;
          insertJump.run(
            String(jumpId),
            String(entry.id),
            jumpIdx,
            JSON.stringify(jump)
          );
        });
      }
    });
  });
  txn();
};

export const loadGame = (): SaveGamePayload | null => {
  const database = getDb();
  const row = database.prepare('SELECT * FROM save_state WHERE id = 1').get() as SaveStateRow | undefined;
  if (!row) return null;

  const entries = database
    .prepare('SELECT * FROM archive_entries ORDER BY completed_at DESC')
    .all() as ArchiveEntryRow[];
  const entryPayloads = entries.map((entryRow) => ({
    id: entryRow.id,
    payload: JSON.parse(entryRow.payload_json),
  }));

  const jumpsByEntry = new Map<string, unknown[]>();
  const jumpRows = database
    .prepare('SELECT * FROM archive_jumps ORDER BY entry_id, sort_index ASC')
    .all() as ArchiveJumpRow[];
  jumpRows.forEach((jumpRow) => {
    const list = jumpsByEntry.get(jumpRow.entry_id) ?? [];
    list.push(JSON.parse(jumpRow.payload_json));
    jumpsByEntry.set(jumpRow.entry_id, list);
  });

  const archiveEntries = entryPayloads.map((entry: { id: string; payload: Record<string, unknown> }) => {
    const results = jumpsByEntry.get(entry.id);
    const payload = entry.payload ?? {};
    return {
      id: String(payload.id ?? entry.id),
      source: String(payload.source ?? 'predazzo'),
      ...payload,
      ...(results && results.length > 0 ? { results } : {}),
    };
  }) as SaveGamePayload['archiveEntries'];

  return {
    version: row.version,
    updatedAt: row.updated_at,
    meta: JSON.parse(row.meta_json ?? '{}'),
    state: JSON.parse(row.state_json ?? '{}'),
    archiveEntries,
  };
};

export const getSaveSummary = (): SaveSummary | null => {
  const database = getDb();
  const row = database.prepare('SELECT version, updated_at, meta_json FROM save_state WHERE id = 1').get() as
    | Pick<SaveStateRow, 'version' | 'updated_at' | 'meta_json'>
    | undefined;
  if (!row) return null;
  return {
    version: row.version,
    updatedAt: row.updated_at,
    meta: JSON.parse(row.meta_json ?? '{}'),
    hasSave: true,
  };
};
