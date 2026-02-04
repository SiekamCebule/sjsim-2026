/**
 * Typy domenowe symulacji skoku.
 * Zgodne z wytycznymi: COMPETITIONS.md (Symulacja skoku, Wiatr, Belka).
 */

/** Punkt K skoczni (np. 98, 128). */
export type KPoint = number;

/** Punkt HS skoczni (np. 107, 141). */
export type HsPoint = number;

/** Odległość w metrach. */
export type Distance = number;

/** Wynik lądowania – wpływa na noty za styl (obliczane osobno). */
export type Landing = 'telemark' | 'parallel' | 'touchDown' | 'fall';

/** Dane skoczni do symulacji (K, HS, metry za belkę). */
export interface HillSimulationData {
  readonly kPoint: KPoint;
  readonly realHs: HsPoint;
  /** Metry dodawane/odejmowane za każdą belkę względem belki startowej. */
  readonly metersByGate: number;
}

export interface Hill {
  readonly simulationData: HillSimulationData;
}

/** Wiatr w m/s: dodatni = pod narty, ujemny = w plecy. */
export interface Wind {
  /** Uśredniony wiatr (m/s). */
  readonly average: number;
  /** Zmienność wiatru 0–1 („loteryjność”). */
  readonly instability: number;
}

/** Umiejętności skoczka (COMPETITIONS.md). W grze skille i forma w skali 0–10; przy wczytywaniu CSV kolumny A_Skill, B_Skill, Form (0–100) są dzielone przez 10. */
export interface JumperSkills {
  /** Skill na mniejszych skoczniach (1–10). */
  readonly smallHillSkill: number;
  /** Skill na większych skoczniach (1–10). */
  readonly bigHillSkill: number;
  /** Lądowanie (-3..3) – wpływa na noty za styl. */
  readonly landingTendency: number;
  /** Forma 0–10 (w CSV kolumna Form to 0–100, przy load → /10). */
  readonly form: number;
  /** Bonus w ważnych skokach (-3..3): dodatni = lepiej w konkursie, ujemny = lepiej na treningu. */
  readonly bonusImportantJumps: number;
}

/** Skoczek w kontekście symulacji (id + umiejętności). */
export interface SimulationJumper {
  readonly id: string;
  readonly skills: JumperSkills;
  /** Skoczkinie skaczą krócej przy tych samych umiejętnościach; symulator stosuje offset zależny od K. */
  readonly isWomen?: boolean;
}

/** Rodzaj serii – wpływa na bonusImportantJumps. */
export type RoundKind = 'training' | 'trial' | 'qualification' | 'competition';

/** Kontekst jednego skoku. */
export interface SimulationContext {
  readonly jumper: SimulationJumper;
  readonly hill: Hill;
  /** Różnica belki względem belki startowej serii (np. 0 = start, -2 = obniżenie o 2). */
  readonly gate: number;
  readonly wind: Wind;
  readonly roundKind: RoundKind;
}

/** Wynik skoku. */
export interface Jump {
  readonly distance: Distance;
  readonly landing: Landing;
}
