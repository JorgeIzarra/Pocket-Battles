export interface Rng {
  int(min: number, max: number): number;
  float(): number;
}

export const realRng: Rng = {
  int: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  float: () => Math.random(),
};

export function fixedRng(opts: { int?: number; float?: number }): Rng {
  return {
    int: () => opts.int ?? 0,
    float: () => opts.float ?? 0,
  };
}
