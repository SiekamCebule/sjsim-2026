/**
 * Abstrakcja losowości (DIP) – umożliwia testy i deterministyczne symulacje.
 */

/** Losowa liczba całkowita z przedziału [min, max] włącznie. */
export interface IRandom {
  randomInt(min: number, max: number): number;
  /** Losowa liczba z przedziału [min, max] (jednostajnie). */
  uniform(min: number, max: number): number;
  /** Rozkład normalny (Box-Muller). */
  gaussian(mean: number, stdDev: number): number;
  /** Rozkład Laplace (cięższe ogony niż Gauss); scale = E[|X-mean|]. */
  laplace(mean: number, scale: number): number;
  /** Rozkład wykładniczy (rate = 1/mean). */
  exponential(rate: number): number;
}

/** Implementacja oparta na Math.random(). */
export function createDefaultRandom(): IRandom {
  return {
    randomInt(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    },

    uniform(min: number, max: number): number {
      return min + Math.random() * (max - min);
    },

    gaussian(mean: number, stdDev: number): number {
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + stdDev * z0;
    },

    laplace(mean: number, scale: number): number {
      const u = Math.random();
      if (u <= 0) return mean;
      if (u >= 1) return mean;
      return u <= 0.5
        ? mean + scale * Math.log(2 * u)
        : mean - scale * Math.log(2 * (1 - u));
    },

    exponential(rate: number): number {
      const u = Math.random();
      return u <= 0 || u >= 1 ? 0 : -Math.log(u) / rate;
    },
  };
}
