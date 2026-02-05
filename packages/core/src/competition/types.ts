/**
 * Typy domenowe konkursów.
 * Zgodne z COMPETITIONS.md: rodzaje zawodów, kolejność, awanse, punktacja.
 */

import type { Distance, Landing, SimulationJumper, Wind } from '../simulation/types';

/** Rodzaj zawodów. */
export type EventKind =
  | 'training'
  | 'trial'
  | 'teamTrial'
  | 'qualification'
  | 'individual'
  | 'duet'
  | 'mixedTeam';

/** Płeć w kontekście zawodów (duety = tylko mężczyźni). */
export type EventGender = 'men' | 'women' | 'mixed';

/** Wynik pojedynczego skoku (odległość, lądowanie, punkty, belka, wiatr). */
export interface JumpResult {
  readonly distance: Distance;
  readonly landing: Landing;
  /** Punkty za skok (odległość + belka + wiatr + ewent. styl). */
  readonly points: number;
  /** Różnica belki względem belki startowej serii. */
  readonly gateDelta: number;
  /** Wiatr w momencie skoku (do wyświetlenia). */
  readonly wind: Wind;
  /** Noty za styl (tylko w konkursach); brak = trening/seria próbna. */
  readonly stylePoints?: number;
  /** Szczegółowe noty sędziów (5 not; konkursy/kwalifikacje). */
  readonly styleNotes?: number[];
  readonly disqualified?: boolean;
}

/** Jeden wpis w serii: kto skoczył + wynik. */
export interface SeriesJumpEntry {
  readonly bib: number;
  readonly jumper: SimulationJumper;
  readonly result: JumpResult;
}

/** Wynik jednej serii (indywidualnie: lista skoków w kolejności startowej). */
export interface SeriesResult {
  readonly jumps: readonly SeriesJumpEntry[];
  /** Belka startowa serii (wartość odniesienia). */
  readonly startGate: number;
}

/** Stan drużyny po serii (duety / mieszane). */
export interface TeamStandingAfterSeries {
  readonly teamIndex: number;
  readonly totalPoints: number;
  readonly rank: number;
  readonly jumpResults: readonly JumpResult[];
}

/** Lista startowa jednej serii: BIB + skoczek (kolejność skakania). */
export interface StartListEntry {
  readonly bib: number;
  readonly jumper: SimulationJumper;
  readonly country?: string;
  readonly teamId?: string;
  readonly slotInTeam?: number;
}

/** Pozycja w klasyfikacji indywidualnej po serii (do budowy kolejności rundy 2+). */
export interface IndividualStanding {
  readonly bib: number;
  readonly jumperId: string;
  readonly country: string;
  readonly totalPoints: number;
  readonly jumpResults: readonly JumpResult[];
}

/** Duet (2 skoczków) – do budowy list startowych z zewnątrz. */
export interface DuetTeam {
  readonly teamId: string;
  readonly country: string;
  readonly jumpers: readonly [SimulationJumper, SimulationJumper];
}

/** Drużyna mieszana (F M F M). */
export interface MixedTeam {
  readonly teamId: string;
  readonly country: string;
  readonly jumpers: readonly [SimulationJumper, SimulationJumper, SimulationJumper, SimulationJumper];
}

/** Stan drużyny po serii (do kolejności grup w rundzie 2+). */
export interface TeamStanding {
  readonly teamId: string;
  readonly country: string;
  readonly totalPoints: number;
  readonly jumpResultsBySlot: readonly JumpResult[][];
}

/** Konkurs indywidualny: każdy wpis = jeden skoczek z wynikami po każdej serii. */
export interface IndividualEventResult {
  readonly kind: 'individual';
  readonly series: readonly SeriesResult[];
  /** Końcowa kolejność: indeks = miejsce (0 = 1.), wartość = BIB. */
  readonly finalOrder: readonly number[];
  /** Suma punktów po wszystkich seriach (indeks = BIB - 1). */
  readonly totalPointsByBib: readonly number[];
}

/** Konkurs duetów: drużyny 2-osobowe, 3 serie, 12 → 8. */
export interface DuetEventResult {
  readonly kind: 'duet';
  readonly series: readonly SeriesResult[];
  readonly finalOrder: readonly number[];
  readonly totalPointsByTeamIndex: readonly number[];
  /** Dla każdej drużyny: [jumper1, jumper2] – wyniki wg serii. */
  readonly teamJumpResults: readonly (readonly JumpResult[])[];
}

/** Konkurs drużyn mieszanych: 4 osoby (W,M,W,M), 2 rundy. */
export interface MixedTeamEventResult {
  readonly kind: 'mixedTeam';
  readonly series: readonly SeriesResult[];
  readonly finalOrder: readonly number[];
  readonly totalPointsByTeamIndex: readonly number[];
  readonly teamJumpResults: readonly (readonly JumpResult[])[];
}

/** Trening / seria próbna: wiele serii, punkty się nie sumują. */
export interface TrainingOrTrialResult {
  readonly kind: 'training' | 'trial' | 'teamTrial';
  readonly series: readonly SeriesResult[];
  /** Dla teamTrial: suma punktów drużynowych po ostatniej serii (opcjonalnie). */
  readonly teamTotals?: readonly number[];
}

/** Kwalifikacje: jedna seria, awansuje 50 (lub 50+ ex aequo). */
export interface QualificationResult {
  readonly kind: 'qualification';
  readonly series: readonly SeriesResult[];
  /** BIB-y awansujących (do konkursu głównego). */
  readonly qualifiedBibs: readonly number[];
  readonly totalPointsByBib: readonly number[];
}

export type EventResult =
  | IndividualEventResult
  | DuetEventResult
  | MixedTeamEventResult
  | TrainingOrTrialResult
  | QualificationResult;

/** Dane wejściowe do rozgrywki: wspólne. */
export interface EventInputBase {
  readonly kind: EventKind;
  readonly hill: { simulationData: { kPoint: number; realHs: number; metersByGate: number } };
  /** Parametry punktacji (belka, metr, wiatr) – z COMPETITIONS. */
  readonly hillScoring: HillScoringParams;
  /** Belka startowa serii. Liczba lub funkcja (seriesIndex) => belka – dla każdej serii osobno. */
  readonly startGate: number | ((seriesIndex: number) => number);
  /** Bazowy wiatr dla zawodów (provider może go użyć). */
  readonly windBase: Wind;
}

/** Konkurs indywidualny / trening / trial / kwalifikacje. */
export interface IndividualEventInput extends EventInputBase {
  readonly kind: 'training' | 'trial' | 'qualification' | 'individual';
  readonly roster: readonly SimulationJumper[];
  /** Kolejność PŚ: od najsłabszego do najlepszego (BIB 1 = pierwszy do skoku). Bez punktów na początku, potem wg rankingu. */
  readonly worldCupOrder: readonly string[];
  /** Tylko training: liczba serii (np. 3). Dla trial = 1, qualification = 1, individual = 2. */
  readonly numberOfSeries?: number;
  /** Dla qualification: ile awansuje (domyślnie 50). */
  readonly qualificationAdvance?: number;
}

/** Duety: drużyny 2-osobowe. */
export interface DuetEventInput extends EventInputBase {
  readonly kind: 'duet';
  /** Drużyny: [ [j1, j2], [j1, j2], ... ]. */
  readonly teams: readonly (readonly [SimulationJumper, SimulationJumper])[];
  /** Kolejność Pucharu Narodów: indeksy drużyn od najsłabszego do najlepszego. */
  readonly nationsCupOrder: readonly number[];
}

/** Drużyny mieszane: 4 osoby (W, M, W, M). */
export interface MixedTeamEventInput extends EventInputBase {
  readonly kind: 'mixedTeam';
  readonly teams: readonly (readonly [SimulationJumper, SimulationJumper, SimulationJumper, SimulationJumper])[];
  readonly nationsCupOrder: readonly number[];
}

/** Seria próbna drużynowa: jak trial, ale z sumami drużynowymi. */
export interface TeamTrialEventInput extends EventInputBase {
  readonly kind: 'teamTrial';
  readonly teams: readonly (readonly SimulationJumper[])[];
  readonly nationsCupOrder: readonly number[];
}

export type EventInput =
  | IndividualEventInput
  | DuetEventInput
  | MixedTeamEventInput
  | TeamTrialEventInput;

/** Przeliczniki punktacji (COMPETITIONS.md). */
export interface HillScoringParams {
  /** Punkty za jedną belkę (np. 7.4 Sapporo). */
  readonly pointsPerGate: number;
  /** Punkty za metr od K (1.8 lub 2.0). */
  readonly pointsPerMeter: number;
  /** Punkty za 1 m/s wiatru pod narty. */
  readonly windHeadwindPerMs: number;
  /** Punkty za 1 m/s wiatru w plecy (wartość dodatnia = odejmujemy przy wietrze w plecy). */
  readonly windTailwindPerMs: number;
}
