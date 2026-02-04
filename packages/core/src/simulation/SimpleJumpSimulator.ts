/**
 * Prosty symulator skoku inspirowany JumpSimulator.cs (C#).
 * Uwzględnia: skill (mała/duża skocznia), formę, wiatr, belkę, koszt HS, lądowanie.
 */

import type { IRandom } from './random';
import type { IJumpSimulator } from './IJumpSimulator';
import type {
  Hill,
  Jump,
  Landing,
  SimulationContext,
  Wind,
} from './types';

/** Domyślna „średnia” umiejętność w skali 1–10. */
const DEFAULT_AVERAGE_BIG_SKILL = 5;

export interface SimulatorConfiguration {
  /** Mnożnik wpływu różnicy umiejętności (2 = dwukrotnie większy wpływ). */
  skillImpactFactor: number;
  /** Średnia umiejętność (skala 1–10) do bazowego ratingu. */
  averageBigSkill: number;
  /** Punkty ratingu wybicia za 1 punkt formy (0–10). */
  takeoffRatingPointsByForm: number;
  /** Punkty ratingu lotu za 1 punkt formy (0–10). */
  flightRatingPointsByForm: number;
  /** Stosunek wpływu lotu do wybicia (np. 3.5 = lot ma 3.5× większy wpływ). */
  flightToTakeoffRatio?: number;
  /** Mnożnik wszystkich losowych dodatków. */
  randomAdditionsRatio?: number;
  /** Skala metrów na punkt ratingu. */
  distanceSpreadByRatingFactor?: number;
  /** Odsetek HS (np. 0.07), od którego zaczyna się wypłaszczanie odległości. */
  hsFlatteningStartRatio?: number;
  /** Siła wypłaszczania (1 = normalnie). */
  hsFlatteningStrength?: number;
}

const defaultConfig: Required<
  Pick<
    SimulatorConfiguration,
    | 'flightToTakeoffRatio'
    | 'randomAdditionsRatio'
    | 'distanceSpreadByRatingFactor'
    | 'hsFlatteningStartRatio'
    | 'hsFlatteningStrength'
  >
> = {
  flightToTakeoffRatio: 1,
  randomAdditionsRatio: 1,
  distanceSpreadByRatingFactor: 1,
  hsFlatteningStartRatio: 0.07,
  hsFlatteningStrength: 1.0,
};

function smoothStep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Skuteczna umiejętność 1–10: blend smallHill vs bigHill wg K (skille już w 1–10). */
function effectiveSkill(
  smallHillSkill: number,
  bigHillSkill: number,
  kPoint: number
): number {
  const t = smoothStep(95, 125, kPoint);
  return lerp(smallHillSkill, bigHillSkill, t);
}

/** Średni wiatr (m/s). */
function windAverage(wind: Wind): number {
  return wind.average;
}

/** Zmienność wiatru 0–1. */
function windInstability(wind: Wind): number {
  return wind.instability;
}

/** Dynamiczny stosunek lot/wybicie wg K (z C#). */
function dynamicFlightToTakeoffRatio(k: number): number {
  if (k <= 50) return 0.2;
  if (k <= 90) return 0.2 + (0.6 - 0.2) * ((k - 50) / 40);
  if (k <= 110) return 0.6 + (1.0 - 0.6) * ((k - 90) / 20);
  if (k <= 135) return 1.0 + (1.5 - 1.0) * ((k - 110) / 25);
  if (k <= 200) return 1.5 + (5.0 - 1.5) * ((k - 135) / 65);
  return k / 40;
}

/** Tłumienie rozrzutu na dużych skoczniach. */
function bigHillSpreadAttenuation(k: number): number {
  return lerp(1.0, 0.6, smoothStep(160, 200, k));
}

/** Metry na 1 m/s wiatru pod narty (wg K). */
function perMsHeadwind(k: number): number {
  const a = 0.0078019484919;
  const b = 1.38264025417;
  return a * Math.pow(k, b);
}

/** Mnożnik dla skoków narciarskich (K ≥ 185). */
function skiFlyingBoost(k: number): number {
  return 1.0 + 0.08 * smoothStep(185, 240, k);
}

/**
 * Średnio kobiety skaczą ~20 m krócej na K125 przy tych samych umiejętnościach.
 * Offset skalowany liniowo z K; na skoczni normalnej (K90–100) ~14–16 m.
 */
function womenDistanceOffset(kPoint: number): number {
  return -20 * (kPoint / 125);
}

/** Mnożnik wiatru w plecy. */
function tailMultiplier(wAbs: number, instability: number): number {
  const baseTail = 1.5 + 0.22 * smoothStep(1.5, 3.5, wAbs);
  const strongWindAtt = 1.0 - 0.5 * smoothStep(4, 10, wAbs);
  const stabilityAtt = 1.0 - 0.5 * Math.min(1, Math.max(0, instability));
  return 1.0 + (baseTail - 1.0) * strongWindAtt * stabilityAtt;
}

/**
 * Losowy mnożnik wpływu wiatru na odległość.
 * - Wiatr pod narty (headwind): factor w [0, 1] — pełny pozytyw lub słabszy; nigdy lepszy niż nominalny, nigdy w drugą stronę.
 * - Wiatr w plecy (tailwind): factor w [1, 1 + instability] — nominalna szkoda lub gorsza; nigdy mniejsza szkoda.
 */
function randomizedWindFactor(
  random: IRandom,
  instability: number,
  isTailwind: boolean
): number {
  if (isTailwind) {
    return 1 + instability * random.uniform(0, 1);
  }
  const rnd = random.gaussian(0, instability * 0.5);
  return Math.max(0, Math.min(1, 1 + rnd));
}

export class SimpleJumpSimulator implements IJumpSimulator {
  private readonly config: SimulatorConfiguration & typeof defaultConfig;

  constructor(
    configuration: SimulatorConfiguration,
    private readonly random: IRandom
  ) {
    this.config = { ...defaultConfig, ...configuration };
  }

  simulate(context: SimulationContext): Jump {
    const takeoffRating = this.calcTakeoffRating(context);
    const flightRating = this.calcFlightRating(context);
    const avgWind = windAverage(context.wind);
    const inst = windInstability(context.wind);
    const rawDistance = this.calcDistance(
      context,
      takeoffRating,
      flightRating,
      avgWind,
      inst
    );
    const realHs = context.hill.simulationData.realHs;
    const distanceAfterHs = this.applyHsCost(rawDistance, realHs);
    const distance = Math.round(distanceAfterHs * 2) / 2;
    const landing = this.generateLanding(context, distance);
    return { distance, landing };
  }

  private skillAndForm(context: SimulationContext): {
    takeoffSkill: number;
    flightSkill: number;
    form: number;
  } {
    const k = context.hill.simulationData.kPoint;
    const s = context.jumper.skills;
    const takeoffSkill = effectiveSkill(s.smallHillSkill, s.bigHillSkill, k);
    const flightSkill = takeoffSkill; // ten sam blend dla obu
    const form = Math.max(0, Math.min(10, s.form));
    return { takeoffSkill, flightSkill, form };
  }

  private takeoffRandomAdditive(): number {
    const drawMax = 1_000_000;
    const draw = this.random.randomInt(1, drawMax);
    const p = draw / drawMax;
    if (p < 0.05)
      return this.config.randomAdditionsRatio * this.random.gaussian(8, 7);
    if (p < 0.15)
      return this.config.randomAdditionsRatio * this.random.gaussian(-18, 10);
    return this.config.randomAdditionsRatio * this.random.gaussian(0, 8);
  }

  private flightRandomAdditive(): number {
    const drawMax = 1_000_000;
    const draw = this.random.randomInt(1, drawMax);
    const p = draw / drawMax;
    if (p < 0.05) return this.random.gaussian(5, 5);
    if (p < 0.15) return this.random.gaussian(-15, 5);
    return this.random.gaussian(0, 6);
  }

  /** Bonus w ważnych skokach (-3..3): 0 = zero. Plus = lepiej w ważnych, gorzej na treningu; minus = odwrotnie. Ten sam współczynnik: o tyle lepiej w jednym, o ile gorzej w drugim. */
  private static readonly ROUND_BONUS_COEF = 1.2;

  private roundBonus(context: SimulationContext): number {
    const bonus = context.jumper.skills.bonusImportantJumps ?? 0;
    if (bonus === 0) return 0;
    const c = SimpleJumpSimulator.ROUND_BONUS_COEF;
    const isImportant =
      context.roundKind === 'competition' ||
      context.roundKind === 'qualification';
    return isImportant ? bonus * c : -bonus * c;
  }

  private calcTakeoffRating(context: SimulationContext): number {
    const { takeoffSkill, form } = this.skillAndForm(context);
    const cfg = this.config;
    const base = cfg.averageBigSkill * 6;
    const deviation = (takeoffSkill - cfg.averageBigSkill) * 6 * cfg.skillImpactFactor;
    const formImpact = form * cfg.takeoffRatingPointsByForm;
    const rnd = this.takeoffRandomAdditive();
    const roundBonus = this.roundBonus(context);
    return base + deviation + formImpact + rnd + roundBonus;
  }

  private calcFlightRating(context: SimulationContext): number {
    const { flightSkill, form } = this.skillAndForm(context);
    const cfg = this.config;
    const base = cfg.averageBigSkill * 6 * 0.96;
    const deviation =
      (flightSkill - cfg.averageBigSkill) * 6 * 0.96 * cfg.skillImpactFactor;
    const formImpact = form * cfg.flightRatingPointsByForm;
    const rnd = this.flightRandomAdditive();
    const roundBonus = this.roundBonus(context);
    return base + deviation + formImpact + rnd + roundBonus;
  }

  private calcDistance(
    context: SimulationContext,
    takeoffRating: number,
    flightRating: number,
    averageWind: number,
    windInstability: number
  ): number {
    const hill = context.hill.simulationData;
    const kPoint = hill.kPoint;
    const metersByGate = hill.metersByGate;
    const gate = context.gate;

    const gateAddition = metersByGate * gate;
    const startingDistance = kPoint / 2.5;

    const baseMetersByRating =
      0.2 * (kPoint / 100) * this.config.distanceSpreadByRatingFactor;
    const metersByRating =
      baseMetersByRating * bigHillSpreadAttenuation(kPoint);

    const takeoffAddition = metersByRating * takeoffRating;

    const flightRatio =
      this.config.flightToTakeoffRatio * dynamicFlightToTakeoffRatio(kPoint);
    const flightAddition =
      metersByRating * flightRating * flightRatio;

    const windAddition = this.calcWindAddition(
      averageWind,
      windInstability,
      kPoint
    );

    let distance =
      startingDistance +
      gateAddition +
      takeoffAddition +
      flightAddition +
      windAddition;

    if (context.jumper.isWomen) {
      distance += womenDistanceOffset(kPoint);
    }

    return distance;
  }

  private calcWindAddition(
    averageWind: number,
    inst: number,
    kPoint: number
  ): number {
    if (averageWind === 0) return 0;
    let perMs = perMsHeadwind(kPoint);
    perMs *= skiFlyingBoost(kPoint);
    const wAbs = Math.abs(averageWind);
    const isTailwind = averageWind < 0;
    const factor = randomizedWindFactor(this.random, inst, isTailwind);
    const metersLinear = wAbs * perMs;
    const asym =
      isTailwind ? -tailMultiplier(wAbs, inst) : 1.0;
    return metersLinear * asym * factor;
  }

  private applyHsCost(distance: number, realHs: number): number {
    if (distance <= realHs) return distance;
    const overHs = distance - realHs;
    const ratio = this.config.hsFlatteningStartRatio;
    const hsScale = ratio <= 0 ? 1e-6 : realHs * ratio;
    const compressed =
      (hsScale * Math.log(1.0 + overHs / hsScale)) /
      this.config.hsFlatteningStrength;
    return realHs + compressed;
  }

  private generateLanding(context: SimulationContext, distance: number): Landing {
    const realHs = context.hill.simulationData.realHs;
    const drawMax = 1_000_000;
    const draw = this.random.randomInt(1, drawMax);
    const p = draw / drawMax;

    if (distance <= realHs) {
      if (p < 0.0005) return 'fall';
      if (p < 0.001) return 'touchDown';
      if (p < 0.009) return 'parallel';
      return 'telemark';
    }

    if (distance <= realHs * 1.036) {
      if (p < 0.005) return 'fall';
      if (p < 0.01) return 'touchDown';
      if (p < 0.2) return 'parallel';
      return 'telemark';
    }

    if (distance <= realHs * 1.075) {
      if (p < 0.05) return 'fall';
      if (p < 0.1) return 'touchDown';
      if (p < 0.97) return 'parallel';
      return 'telemark';
    }

    if (p < 0.7) return 'fall';
    return 'touchDown';
  }
}
