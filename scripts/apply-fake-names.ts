/// <reference types="node" />

import fs from 'node:fs/promises';
import path from 'node:path';

type FakeNameEntry = {
  country: string;
  name: string;
  surname: string;
  fakeName: string;
  fakeSurname: string;
};

type ReplaceResult = {
  text: string;
  replacements: number;
};

const DEFAULT_DIST_RELATIVE = path.join('packages', 'ui', 'dist');
const FAKE_NAMES_FILE = 'fakeNames.csv';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFakeNames(raw: string): FakeNameEntry[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0]?.split(',').map((c) => c.trim()) ?? [];
  const expected = ['Country', 'Name', 'Surname', 'FakeName', 'FakeSurname'];
  const headerMatches = expected.every((key, idx) => header[idx] === key);
  if (!headerMatches) {
    throw new Error(
      `Unexpected header in ${FAKE_NAMES_FILE}. Expected: ${expected.join(',')}`
    );
  }

  const entries: FakeNameEntry[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length < 5) continue;
    entries.push({
      country: cells[0] ?? '',
      name: cells[1] ?? '',
      surname: cells[2] ?? '',
      fakeName: cells[3] ?? '',
      fakeSurname: cells[4] ?? '',
    });
  }
  return entries.filter((entry) => entry.country && entry.name && entry.surname);
}

function applyFakeNamesToText(text: string, entries: FakeNameEntry[]): ReplaceResult {
  let updated = text;
  let replacements = 0;

  for (const entry of entries) {
    const pattern = new RegExp(
      `(${escapeRegExp(entry.country)}\\s*,\\s*)${escapeRegExp(entry.name)}(\\s*,\\s*)${escapeRegExp(entry.surname)}`,
      'gu'
    );
    let localCount = 0;
    updated = updated.replace(pattern, (_match, p1, p2) => {
      localCount += 1;
      return `${p1}${entry.fakeName}${p2}${entry.fakeSurname}`;
    });
    replacements += localCount;
  }

  return { text: updated, replacements };
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveDistPath(args: string[], root: string): string {
  const distArgIndex = args.indexOf('--dist');
  if (distArgIndex !== -1 && args[distArgIndex + 1]) {
    return path.resolve(args[distArgIndex + 1]!);
  }
  return path.resolve(root, DEFAULT_DIST_RELATIVE);
}

function shouldProcessFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.map') return false;
  return ['.js', '.mjs', '.cjs', '.html', '.csv'].includes(ext);
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const distPath = resolveDistPath(args, root);
  const dryRun = args.includes('--dry-run');
  const isRelease =
    args.includes('--release') || process.env.NODE_ENV === 'production';

  if (!isRelease) {
    console.log(
      '[fake-names] Skipped. Use --release or NODE_ENV=production for release builds.'
    );
    return;
  }

  const fakeNamesPath = path.resolve(root, FAKE_NAMES_FILE);
  const fakeNamesRaw = await fs.readFile(fakeNamesPath, 'utf-8');
  const entries = parseFakeNames(fakeNamesRaw);

  if (entries.length === 0) {
    throw new Error(`No entries found in ${FAKE_NAMES_FILE}.`);
  }

  const distStat = await fs.stat(distPath).catch(() => null);
  if (!distStat || !distStat.isDirectory()) {
    throw new Error(`Dist folder not found: ${distPath}`);
  }

  const files = (await listFilesRecursive(distPath)).filter(shouldProcessFile);
  if (files.length === 0) {
    throw new Error(`No files to process in ${distPath}.`);
  }

  let totalReplacements = 0;
  let touchedFiles = 0;

  for (const filePath of files) {
    const original = await fs.readFile(filePath, 'utf-8');
    const result = applyFakeNamesToText(original, entries);
    if (result.replacements > 0) {
      totalReplacements += result.replacements;
      touchedFiles += 1;
      if (!dryRun) {
        await fs.writeFile(filePath, result.text, 'utf-8');
      }
    }
  }

  const action = dryRun ? 'Dry run' : 'Done';
  const replacementsMsg = `${totalReplacements} replacements in ${touchedFiles} files`;
  console.log(`[fake-names] ${action}. ${replacementsMsg}.`);
}

main().catch((error) => {
  console.error('[fake-names] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
