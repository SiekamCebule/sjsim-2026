#!/usr/bin/env npx tsx
/**
 * Skrypt "na boku": wczytuje powołania z men_jumpers_sapporo.csv,
 * sprawdza błędy i niespójności względem men_jumpers_all.csv (limity obowiązują tylko w Predazzo, tu nie sprawdzamy),
 * symuluje cały weekend Sapporo (piątek: 2 treningi, kwali; sobota: próbna, konkurs; niedziela: kwali, konkurs).
 *
 * Uruchomienie z katalogu głównego repo: pnpm sapporo
 * Opcja: pnpm sapporo -- --ignore-missing  (pomiń brakujących w all, symuluj z pozostałymi)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  runSapporoWeekend,
  createDefaultRandom,
  type SimulationJumper,
  type JumperSkills,
  type SapporoWeekendResult,
} from '../packages/core/src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

// --- CSV parsing (standalone, no UI dependency) ---
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

interface CsvJumper {
  country: string;
  name: string;
  surname: string;
}

interface JumperAll extends CsvJumper {
  aSkill: number;
  bSkill: number;
  landing: number;
  form: number;
  bonusImportantJumps: number;
}

function parseNum(s: string, def: number, min?: number, max?: number): number {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return def;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

function loadSapporoCallups(): CsvJumper[] {
  const raw = fs.readFileSync(path.join(ASSETS, 'men_jumpers_sapporo.csv'), 'utf-8');
  return csvToObjects(raw, (r) => ({
    country: r.Country ?? '',
    name: r.Name ?? '',
    surname: r.Surname ?? '',
  }));
}

function loadMenJumpersAll(): JumperAll[] {
  const raw = fs.readFileSync(path.join(ASSETS, 'men_jumpers_all.csv'), 'utf-8');
  return csvToObjects(raw, (r) => ({
    country: r.Country ?? '',
    name: r.Name ?? '',
    surname: r.Surname ?? '',
    aSkill: parseNum(r.A_Skill ?? '', 50, 1, 100),
    bSkill: parseNum(r.B_Skill ?? '', 50, 1, 100),
    landing: parseNum(r.Landing ?? '', 0, -3, 3),
    form: parseNum(r.Form ?? '', 50, 0, 100), // CSV: 0–100 (w grze potem 0–10)
    bonusImportantJumps: parseNum(r.BonusImportantJumps ?? '', 0, -3, 3),
  }));
}

function loadWorldCupOrder(): { position: number; country: string; name: string; surname: string }[] {
  const raw = fs.readFileSync(path.join(ASSETS, 'men_world_cup_sapporo.csv'), 'utf-8');
  return csvToObjects(raw, (r) => ({
    position: parseInt(r.Position ?? '0', 10),
    country: r.Country ?? '',
    name: r.Name ?? '',
    surname: r.Surname ?? '',
  })).filter((x) => x.position > 0);
}

// --- Validation (limity tylko w Predazzo – w Sapporo powołania są takie, jakie są) ---
function jumperKey(j: CsvJumper): string {
  return `${j.country}|${j.name}|${j.surname}`;
}

function validateCallups(callups: CsvJumper[], all: JumperAll[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const allByKey = new Map<string, JumperAll>();
  all.forEach((j) => allByKey.set(jumperKey(j), j));

  for (const c of callups) {
    const key = jumperKey(c);
    const found = allByKey.get(key);
    if (!found) {
      const byName = all.filter((j) => j.name === c.name && j.surname === c.surname);
      if (byName.length > 0) {
        errors.push(`Niespójność: ${c.country} ${c.name} ${c.surname} – w all jest jako ${byName.map((x) => x.country).join(', ')}`);
      } else {
        errors.push(`Brak w men_jumpers_all: ${c.country} ${c.name} ${c.surname}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Skille w CSV 1–100 → w grze 1–10 (przemiana przy load). */
function csvSkillTo1_10(x: number): number {
  return Math.max(1, Math.min(10, x / 10));
}

/** Forma w CSV 0–100 → w grze 0–10 (przemiana przy load). */
function csvFormTo0_10(x: number): number {
  return Math.max(0, Math.min(10, x / 10));
}

// --- Build roster (SimulationJumper) and world cup order (jumper ids) ---
function toSimulationJumper(j: JumperAll, id: string): SimulationJumper {
  const skills: JumperSkills = {
    smallHillSkill: csvSkillTo1_10(j.aSkill),
    bigHillSkill: csvSkillTo1_10(j.bSkill),
    landingTendency: j.landing,
    form: csvFormTo0_10(j.form),
    bonusImportantJumps: j.bonusImportantJumps,
  };
  return { id, skills };
}

function buildRosterAndOrder(
  callups: CsvJumper[],
  all: JumperAll[],
  worldCupOrder: { position: number; country: string; name: string; surname: string }[]
): { roster: SimulationJumper[]; worldCupOrderIds: string[] } {
  const allByKey = new Map<string, JumperAll>();
  all.forEach((j) => allByKey.set(jumperKey(j), j));

  const roster: SimulationJumper[] = [];
  const idByKey = new Map<string, string>();
  for (const c of callups) {
    const key = jumperKey(c);
    const j = allByKey.get(key);
    if (!j) continue;
    const id = `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
    idByKey.set(key, id);
    roster.push(toSimulationJumper(j, id));
  }

  const worldCupOrderIds: string[] = [];
  const sorted = [...worldCupOrder].sort((a, b) => b.position - a.position);
  for (const w of sorted) {
    const key = `${w.country}|${w.name}|${w.surname}`;
    const id = idByKey.get(key);
    if (id) worldCupOrderIds.push(id);
  }
  return { roster, worldCupOrderIds };
}

// --- Formatting helpers ---
function printSingleSeriesStep(step: { rows: readonly any[]; gate: number }): void {
  console.log(`  Wyniki (belka ${step.gate}):`);
  console.log('  M. BIB  Zawodnik                    Skok              Punkty');

  step.rows.forEach((row) => {
    const name = row.jumperId.padEnd(28);
    const line = `${row.distance.toFixed(1)} m, ${row.points.toFixed(1)} pkt`;
    console.log(`  ${String(row.position).padStart(2)}. ${String(row.bib).padStart(3)}  ${name}  ${line}`);
  });
}

function printTwoSeriesStep(step: { rows: readonly any[]; gate1: number; gate2: number }): void {
  console.log(`  Belka 1: ${step.gate1}, Belka 2: ${step.gate2}`);
  console.log('  M. BIB  Zawodnik                    Skok 1        Skok 2       Suma');

  step.rows.forEach((row) => {
    const name = row.jumperId.padEnd(28);
    const line1 = `${row.jump1.distance.toFixed(1)} m, ${row.jump1.points.toFixed(1)} pkt`;
    const line2 = row.jump2
      ? `${row.jump2.distance.toFixed(1)} m, ${row.jump2.points.toFixed(1)} pkt`
      : '-';
    const total = row.total.toFixed(1);
    console.log(`  ${String(row.position).padStart(2)}. ${String(row.bib).padStart(3)}  ${name}  ${line1.padEnd(14)}  ${line2.padEnd(14)}  ${total} pkt`);
  });
}

// --- Run weekend ---
function main(): void {
  const ignoreMissing = process.argv.includes('--ignore-missing');
  console.log('=== Symulacja weekendu Sapporo ===\n');

  let callups = loadSapporoCallups();
  const all = loadMenJumpersAll();
  const worldCupOrder = loadWorldCupOrder();

  console.log(`Powołanych: ${callups.length}`);
  console.log(`W men_jumpers_all: ${all.length}`);
  console.log(`Kolejność PŚ (sapporo): ${worldCupOrder.length} pozycji\n`);

  const validation = validateCallups(callups, all);
  if (!validation.ok) {
    if (ignoreMissing) {
      const allByKey = new Map(all.map((j) => [jumperKey(j), j]));
      callups = callups.filter((c) => allByKey.has(jumperKey(c)));
      console.warn('Uruchomiono z --ignore-missing: pominięto brakujących/niespójnych, symulacja z', callups.length, 'skoczkami.\n');
    } else {
      console.error('Błędy / niespójności (skrypt się zatrzymuje). Użyj --ignore-missing, by symulować bez brakujących:\n');
      validation.errors.forEach((e) => console.error('  -', e));
      process.exit(1);
    }
  } else {
    console.log('Walidacja: OK (wszyscy w all). Limity obowiązują tylko w Predazzo.\n');
  }

  const { roster, worldCupOrderIds } = buildRosterAndOrder(callups, all, worldCupOrder);
  const random = createDefaultRandom();

  // Używamy runSapporoWeekend z core - jeden symulator dla całej aplikacji!
  const result = runSapporoWeekend({
    roster,
    worldCupOrderIds,
    random,
  });

  // Wyświetlamy wszystkie kroki (steps) w kolejności
  for (const step of result.steps) {
    if (step.day === 'friday') {
      console.log(`\n--- Piątek: ${step.eventLabel} ---`);
    } else if (step.day === 'saturday') {
      console.log(`\n--- Sobota: ${step.eventLabel} ---`);
    } else if (step.day === 'sunday') {
      console.log(`\n--- Niedziela: ${step.eventLabel} ---`);
    }

    if (step.kind === 'single') {
      printSingleSeriesStep(step);
    } else if (step.kind === 'two') {
      printTwoSeriesStep(step);
    }
  }

  console.log('\n=== Koniec symulacji Sapporo ===');
}

main();
