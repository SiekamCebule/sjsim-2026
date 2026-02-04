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
  runEvent,
  createDefaultRandom,
  SimpleJumpSimulator,
  windEngine,
  constantGatePolicy,
  HILL_PARAMS,
  selectStartingGate,
  JuryBravery,
  type IndividualEventInput,
  type IndividualEventResult,
  type QualificationResult,
  type SimulationJumper,
  type JumperSkills,
  type Wind,
  type SeriesResult,
  type SeriesJumpEntry,
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

// --- Hill: Sapporo HS137 ---
const SAPPORO_HILL = {
  simulationData: {
    kPoint: 123,
    realHs: 137,
    metersByGate: 5.5,
  },
} as const;

const SAPPORO_SCORING = HILL_PARAMS['sapporo-hs137']!;

/** Belka startowa przed rundą – metoda iteracyjna. Domyślnie Medium, na trening High. */
function selectGate(
  roster: SimulationJumper[],
  jumpSimulator: Parameters<typeof selectStartingGate>[0]['simulator'],
  windProvider: Parameters<typeof selectStartingGate>[0]['windProvider'],
  bravery: JuryBravery = JuryBravery.Medium
): number {
  return selectStartingGate({
    simulator: jumpSimulator,
    windProvider,
    juryBravery: bravery,
    jumpers: roster,
    hill: SAPPORO_HILL,
  });
}

/** Wyniki jednej serii posortowane wg pozycji (najlepsi pierwsi). */
function orderByPoints(series: SeriesResult): SeriesJumpEntry[] {
  return [...series.jumps].sort((a, b) => b.result.points - a.result.points);
}

/** Suma punktów po wszystkich seriach (indeks = BIB - 1). */
function totalByBibFromSeries(series: readonly SeriesResult[]): number[] {
  const maxBib = Math.max(0, ...series.flatMap((s) => s.jumps.map((j) => j.bib)));
  const total = new Array<number>(maxBib).fill(0);
  for (const s of series) {
    for (const j of s.jumps) {
      total[j.bib - 1] = (total[j.bib - 1] ?? 0) + j.result.points;
    }
  }
  return total;
}

/** Kolejność BIBów wg sumy punktów (najlepsi pierwsi). */
function finalOrderFromSeries(series: readonly SeriesResult[]): number[] {
  const total = totalByBibFromSeries(series);
  const bibs = [...new Set(series.flatMap((s) => s.jumps.map((j) => j.bib)))];
  return bibs.sort((a, b) => (total[b - 1] ?? 0) - (total[a - 1] ?? 0));
}

/** Jedna seria: tabela wg pozycji (M. BIB Zawodnik Skok Punkty). */
function printSingleSeriesByPosition(series: SeriesResult, title: string): void {
  console.log(`  ${title}`);
  const ordered = orderByPoints(series);
  console.log('  M. BIB  Zawodnik                    Skok 1              Punkty');
  ordered.forEach((j, idx) => {
    const r = j.result;
    const name = j.jumper.id.padEnd(28);
    const line1 = `${r.distance.toFixed(1)} m, ${r.points.toFixed(1)} pkt`;
    console.log(`  ${String(idx + 1).padStart(2)}. ${String(j.bib).padStart(3)}  ${name}  ${line1}`);
  });
}

/** Dwie serie: tabela wg pozycji jak konkurs (M. BIB Zawodnik Skok 1 Skok 2 Suma). */
function printTwoSeriesByPosition(
  series: readonly [SeriesResult, SeriesResult],
  totalByBib: readonly number[],
  finalOrder: readonly number[]
): void {
  const jumpByBib = (s: SeriesResult): Map<number, SeriesJumpEntry> => {
    const m = new Map<number, SeriesJumpEntry>();
    for (const j of s.jumps) m.set(j.bib, j);
    return m;
  };
  const s0 = jumpByBib(series[0]);
  const s1 = jumpByBib(series[1]);
  console.log('  M. BIB  Zawodnik                    Skok 1        Skok 2       Suma');
  finalOrder.forEach((bib, idx) => {
    const entry0 = s0.get(bib);
    const name = (entry0?.jumper.id ?? `BIB${bib}`).padEnd(28);
    const r1 = entry0?.result;
    const r2 = s1.get(bib)?.result;
    const line1 = r1 ? `${r1.distance.toFixed(1)} m, ${r1.points.toFixed(1)} pkt` : '-';
    const line2 = r2 ? `${r2.distance.toFixed(1)} m, ${r2.points.toFixed(1)} pkt` : '-';
    const total = (totalByBib[bib - 1] ?? 0).toFixed(1);
    console.log(`  ${String(idx + 1).padStart(2)}. ${String(bib).padStart(3)}  ${name}  ${line1.padEnd(14)}  ${line2.padEnd(14)}  ${total} pkt`);
  });
}

function printTrainingResult(
  result: { series: readonly SeriesResult[] },
  _roster: SimulationJumper[]
): void {
  const totalByBib = totalByBibFromSeries(result.series);
  const finalOrder = finalOrderFromSeries(result.series);
  console.log(`  Seria 1 belka ${result.series[0]!.startGate}, Seria 2 belka ${result.series[1]!.startGate}`);
  printTwoSeriesByPosition(
    [result.series[0]!, result.series[1]!],
    totalByBib,
    finalOrder
  );
}

function printCompetitionResult(
  result: IndividualEventResult,
  _roster: SimulationJumper[]
): void {
  printTwoSeriesByPosition(
    [result.series[0]!, result.series[1]!],
    result.totalPointsByBib,
    result.finalOrder
  );
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
  const jumpSimulator = new SimpleJumpSimulator(
    { skillImpactFactor: 1.5, averageBigSkill: 5, takeoffRatingPointsByForm: 1.5, flightRatingPointsByForm: 1.8 },
    random
  );
  const baseWind: Wind = { average: 2.4, instability: 0.1 };

  const runDeps = {
    jumpSimulator,
    windProvider: windEngine(
      { baseAverage: baseWind.average, windVariability: baseWind.instability },
      random
    ),
    gatePolicy: constantGatePolicy(0),
    random,
  };

  const hill = SAPPORO_HILL;
  const hillScoring = SAPPORO_SCORING;

  // Piątek: trening (2 serie)
  console.log('--- Piątek: trening (2 serie) ---');
  const startGateTraining = selectGate(roster, runDeps.jumpSimulator, runDeps.windProvider, JuryBravery.High);
  console.log(`  Belka startowa (JuryBravery=High): ${startGateTraining}`);
  const trainingInput: IndividualEventInput = {
    kind: 'training',
    hill,
    hillScoring,
    startGate: startGateTraining,
    windBase: baseWind,
    roster,
    worldCupOrder: worldCupOrderIds,
    numberOfSeries: 2,
  };
  const trainingResult = runEvent(trainingInput, runDeps);
  if (trainingResult.kind !== 'training') throw new Error('Expected training');
  printTrainingResult(trainingResult, roster);

  console.log('\n--- Piątek: kwalifikacje (awans 50) ---');
  const startGateQuali1 = selectGate(roster, runDeps.jumpSimulator, runDeps.windProvider);
  console.log(`  Belka startowa (JuryBravery=Medium): ${startGateQuali1}`);
  const quali1Input: IndividualEventInput = {
    kind: 'qualification',
    hill,
    hillScoring,
    startGate: startGateQuali1,
    windBase: baseWind,
    roster,
    worldCupOrder: worldCupOrderIds,
    qualificationAdvance: 50,
  };
  const quali1Result = runEvent(quali1Input, runDeps) as QualificationResult;
  const qualifiedBibs1 = quali1Result.qualifiedBibs;
  console.log(`  Awansowało: ${qualifiedBibs1.length}`);
  printSingleSeriesByPosition(quali1Result.series[0]!, 'Wyniki kwalifikacji (belka ' + quali1Result.series[0]!.startGate + '):');

  // Po kwalifikacjach kolejność dalej od PŚ; dopiero 2. seria konkursu na bazie 1. serii
  const qualifiedIds1 = qualifiedBibs1
    .map((bib) => roster[bib - 1]?.id)
    .filter((id): id is string => id != null);
  const orderSaturday = [...qualifiedIds1].sort(
    (a, b) => worldCupOrderIds.indexOf(a) - worldCupOrderIds.indexOf(b)
  );

  const rosterSaturday = qualifiedBibs1
    .map((bib) => roster[bib - 1])
    .filter((j): j is SimulationJumper => j != null);

  console.log('\n--- Sobota: seria próbna ---');
  const startGateTrial = selectGate(rosterSaturday, runDeps.jumpSimulator, runDeps.windProvider);
  console.log(`  Belka startowa (JuryBravery=Medium): ${startGateTrial}`);
  const trialInput: IndividualEventInput = {
    kind: 'trial',
    hill,
    hillScoring,
    startGate: startGateTrial,
    windBase: baseWind,
    roster: rosterSaturday,
    worldCupOrder: orderSaturday,
  };
  const trialResult = runEvent(trialInput, runDeps);
  if (trialResult.kind !== 'trial') throw new Error('Expected trial');
  printSingleSeriesByPosition(trialResult.series[0]!, 'Wyniki serii próbnej (belka ' + trialResult.series[0]!.startGate + '):');

  console.log('\n--- Sobota: konkurs indywidualny ---');
  const startGateInd1 = selectGate(rosterSaturday, runDeps.jumpSimulator, runDeps.windProvider);
  console.log(`  Belka startowa (JuryBravery=Medium): ${startGateInd1}`);
  const ind1Input: IndividualEventInput = {
    kind: 'individual',
    hill,
    hillScoring,
    startGate: startGateInd1,
    windBase: baseWind,
    roster: rosterSaturday,
    worldCupOrder: orderSaturday,
  };
  const ind1Result = runEvent(ind1Input, runDeps) as IndividualEventResult;
  printCompetitionResult(ind1Result, rosterSaturday);

  console.log('\n--- Niedziela: kwalifikacje ---');
  const startGateQuali2 = selectGate(roster, runDeps.jumpSimulator, runDeps.windProvider);
  console.log(`  Belka startowa (JuryBravery=Medium): ${startGateQuali2}`);
  const quali2Input: IndividualEventInput = {
    ...quali1Input,
    startGate: startGateQuali2,
  };
  const quali2Result = runEvent(quali2Input, runDeps) as QualificationResult;
  const qualifiedBibs2 = quali2Result.qualifiedBibs;
  console.log(`  Awansowało: ${qualifiedBibs2.length}`);
  printSingleSeriesByPosition(quali2Result.series[0]!, 'Wyniki kwalifikacji (belka ' + quali2Result.series[0]!.startGate + '):');

  const qualifiedIds2 = qualifiedBibs2
    .map((bib) => roster[bib - 1]?.id)
    .filter((id): id is string => id != null);
  const orderSunday = [...qualifiedIds2].sort(
    (a, b) => worldCupOrderIds.indexOf(a) - worldCupOrderIds.indexOf(b)
  );
  const rosterSunday = qualifiedBibs2
    .map((bib) => roster[bib - 1])
    .filter((j): j is SimulationJumper => j != null);

  console.log('\n--- Niedziela: konkurs indywidualny ---');
  const startGateInd2 = selectGate(rosterSunday, runDeps.jumpSimulator, runDeps.windProvider);
  console.log(`  Belka startowa (JuryBravery=Medium): ${startGateInd2}`);
  const ind2Input: IndividualEventInput = {
    kind: 'individual',
    hill,
    hillScoring,
    startGate: startGateInd2,
    windBase: baseWind,
    roster: rosterSunday,
    worldCupOrder: orderSunday,
  };
  const ind2Result = runEvent(ind2Input, runDeps) as IndividualEventResult;
  printCompetitionResult(ind2Result, rosterSunday);

  console.log('\n=== Koniec symulacji Sapporo ===');
}

main();
