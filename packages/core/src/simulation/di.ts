/**
 * Tokeny DI i rejestracja domyślnego symulatora skoków.
 */
import type { DependencyToken } from '../di';
import { createToken } from '../di';
import type { IJumpSimulator } from './IJumpSimulator';
import type { SimulatorConfiguration } from './SimpleJumpSimulator';
import type { IRandom } from './random';
import { createDefaultRandom } from './random';
import { SimpleJumpSimulator } from './SimpleJumpSimulator';

export const JumpSimulatorToken = createToken<IJumpSimulator>('JumpSimulator');
export const RandomToken = createToken<IRandom>('Random');

const defaultSimulatorConfig: SimulatorConfiguration = {
  skillImpactFactor: 1,
  averageBigSkill: 7,
  takeoffRatingPointsByForm: 1.5,
  flightRatingPointsByForm: 1.8,
  flightToTakeoffRatio: 1,
  randomAdditionsRatio: 1,
  distanceSpreadByRatingFactor: 1,
  hsFlatteningStartRatio: 0.07,
  hsFlatteningStrength: 1.0,
};

export interface DiContainer {
  register<T>(token: DependencyToken<T>, factory: () => T, options?: { singleton?: boolean }): void;
  resolve<T>(token: DependencyToken<T>): T;
}

/**
 * Rejestruje w kontenerze domyślny symulator skoków i generator losowy.
 * Random i JumpSimulator rejestrowane jako singletony.
 */
export function registerDefaultJumpSimulator(
  container: DiContainer,
  config: Partial<SimulatorConfiguration> = {}
): void {
  container.register(RandomToken, createDefaultRandom, { singleton: true });
  container.register(JumpSimulatorToken, () => {
    const random = container.resolve(RandomToken);
    return new SimpleJumpSimulator(
      { ...defaultSimulatorConfig, ...config },
      random
    );
  }, { singleton: true });
}
