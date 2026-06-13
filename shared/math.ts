export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function dist(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Deterministic PRNG (mulberry32). Same seed → same sequence. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * 1D value noise with smooth interpolation, deterministic per seed.
 * Returns values in [0, 1] at arbitrary x (period = lattice spacing 1).
 */
export function createValueNoise1D(seed: number): (x: number) => number {
  const valueAt = (i: number): number => {
    const r = createRng((seed ^ Math.imul(i | 0, 0x9e3779b9)) >>> 0);
    return r();
  };
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f); // smoothstep
    return lerp(valueAt(i), valueAt(i + 1), s);
  };
}

/** Fractal (fBm) 1D noise in [0, 1]. */
export function createFbm1D(seed: number, octaves = 4): (x: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => createValueNoise1D(seed + o * 101));
  return (x: number) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (const noise of layers) {
      sum += noise(x * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
