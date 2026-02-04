#!/usr/bin/env npx tsx
/**
 * Test systemu zmiany formy (FORM_CHANGES.md).
 * Wczytuje skoczków z men_jumpers_all.csv, stosuje zmianę formy z podaną alfą,
 * wypisuje tabelę przed/po z kolorami, ranking największych zmian i statystyki.
 *
 * Uruchomienie z katalogu głównego: pnpm exec tsx scripts/test-form-change.ts
 * Opcja: pnpm exec tsx scripts/test-form-change.ts --alpha=0.1
 *        pnpm exec tsx scripts/test-form-change.ts 0.04
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  createDefaultRandom,
  applyFormChangeToRoster,
  type SimulationJumper,
  type JumperSkills,
} from '../packages/core/src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

// --- ANSI kolory ---
const R = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const G = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string): string => `\x1b[33m${s}\x1b[0m`;
const B = (s: string): string => `\x1b[34m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

function parseCsv(raw: string): string[][] {
  return raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map((c) => c.trim()));
}

function csvToObjects<T>(raw: string, map: (row: Record<string, string>) => T): T[] {
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];
  const headers = rows[0]!;
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      obj[h] = row[j] ?? '';
    });
    return map(obj);
  });
}

function parseNum(s: string, def: number, min?: number, max?: number): number {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return def;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

interface JumperRow {
  country: string;
  name: string;
  surname: string;
  formCsv: number; // 0–100
}

function loadMenJumpersAll(): JumperRow[] {
  const raw = fs.readFileSync(path.join(ASSETS, 'men_jumpers_all.csv'), 'utf-8');
  return csvToObjects(raw, (r) => ({
    country: r.Country ?? '',
    name: r.Name ?? '',
    surname: r.Surname ?? '',
    formCsv: parseNum(r.Form ?? '', 50, 0, 100),
  }));
}

/** Forma w grze 0–10 (CSV 0–100 / 10). */
function formCsvToGame(csv: number): number {
  return Math.max(0, Math.min(10, csv / 10));
}

function toSimulationJumper(row: JumperRow): SimulationJumper {
  const id = `${row.country}-${row.name}-${row.surname}`.replace(/\s+/g, '-');
  const skills: JumperSkills = {
    smallHillSkill: 5,
    bigHillSkill: 5,
    landingTendency: 0,
    form: formCsvToGame(row.formCsv),
    bonusImportantJumps: 0,
  };
  return { id, skills };
}

function formatForm(f: number): string {
  return f.toFixed(2);
}

function main(): void {
  const alphaArg = process.argv.find((a) => a.startsWith('--alpha='));
  const posArg = process.argv[2];
  const alpha =
    alphaArg != null
      ? Number(alphaArg.replace('--alpha=', ''))
      : posArg != null && !posArg.startsWith('-')
        ? Number(posArg)
        : 0.04;
  if (Number.isNaN(alpha) || alpha <= 0) {
    console.error('Użycie: tsx scripts/test-form-change.ts [alfa] lub --alpha=0.04');
    process.exit(1);
  }

  const rows = loadMenJumpersAll();
  const rosterBefore = rows.map(toSimulationJumper);
  const random = createDefaultRandom();
  const rosterAfter = applyFormChangeToRoster(rosterBefore, alpha, random);

  const pairs = rosterBefore.map((j, i) => {
    const after = rosterAfter[i]!;
    const beforeForm = j.skills.form;
    const afterForm = after.skills.form;
    const delta = afterForm - beforeForm;
    return {
      id: j.id,
      name: j.id.replace(/^[A-Z]{3}-/, '').replace(/-/g, ' '),
      country: j.id.slice(0, 3),
      before: beforeForm,
      after: afterForm,
      delta,
    };
  });

  // Statystyki delt (przed clampem nie mamy – liczymy z faktycznych after - before)
  const deltas = pairs.map((p) => p.delta);
  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const n = deltas.length;
  const sum = deltas.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median =
    n % 2 === 1 ? sortedDeltas[n >> 1]! : (sortedDeltas[n / 2 - 1]! + sortedDeltas[n / 2]!) / 2;
  const variance =
    deltas.reduce((acc, d) => acc + (d - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const std = Math.sqrt(variance);
  const absDeltas = deltas.map((d) => Math.abs(d));
  const meanAbs = absDeltas.reduce((a, b) => a + b, 0) / n;
  const minD = Math.min(...deltas);
  const maxD = Math.max(...deltas);

  // Ranking największych zmian (wg |delta|)
  const byAbsDelta = [...pairs].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topGain = [...pairs].sort((a, b) => b.delta - a.delta).slice(0, 5);
  const topLoss = [...pairs].sort((a, b) => a.delta - b.delta).slice(0, 5);

  console.log(B('\n=== Test zmiany formy (FORM_CHANGES.md) ===\n'));
  console.log(`Alfa: ${alpha}`);
  console.log(`Skoczków: ${n}\n`);

  console.log(Y('--- Statystyki zmian formy ---'));
  console.log(`Średnia zmiana (delta):     ${mean.toFixed(4)}`);
  console.log(`Średnia |delta|:            ${meanAbs.toFixed(4)} (oczekiwana ≈ alfa)`);
  console.log(`Mediana delta:             ${median.toFixed(4)}`);
  console.log(`Odch. std. delta:           ${std.toFixed(4)}`);
  console.log(`Min delta:                 ${minD.toFixed(4)}`);
  console.log(`Max delta:                 ${maxD.toFixed(4)}`);
  console.log('');

  console.log(Y('--- Top 5 największych wzrostów formy ---'));
  topGain.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.country} ${p.name}: ${formatForm(p.before)} → ${G(formatForm(p.after))} (${G(`+${p.delta.toFixed(2)}`)})`);
  });
  console.log('');
  console.log(Y('--- Top 5 największych spadków formy ---'));
  topLoss.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.country} ${p.name}: ${formatForm(p.before)} → ${R(formatForm(p.after))} (${R(p.delta.toFixed(2))})`);
  });
  console.log('');
  console.log(Y('--- Ranking największych zmian (wg |delta|) ---'));
  byAbsDelta.slice(0, 10).forEach((p, i) => {
    const sign = p.delta >= 0 ? '+' : '';
    const deltaStr = p.delta >= 0 ? G(`${sign}${p.delta.toFixed(2)}`) : R(p.delta.toFixed(2));
    console.log(`  ${i + 1}. ${p.country} ${p.name}: ${formatForm(p.before)} → ${formatForm(p.after)} (${deltaStr})`);
  });

  console.log('\n' + Y('--- Tabela przed / po (pierwsi 25) ---'));
  const header = `${dim('Kraj')}  ${dim('Nazwisko')}           ${dim('Przed')}  ${dim('Po')}   ${dim('Δ')}`;
  console.log(header);
  console.log(dim('-'.repeat(55)));
  pairs.slice(0, 25).forEach((p) => {
    const deltaStr =
      p.delta > 0 ? G(`+${p.delta.toFixed(2)}`) : p.delta < 0 ? R(p.delta.toFixed(2)) : dim('0.00');
    const namePad = p.name.slice(0, 18).padEnd(18);
    console.log(
      ` ${p.country}  ${namePad}  ${formatForm(p.before).padStart(5)}  ${formatForm(p.after).padStart(5)}  ${deltaStr}`
    );
  });
  if (pairs.length > 25) {
    console.log(dim(`... i ${pairs.length - 25} kolejnych`));
  }
  console.log('');
}

main();
