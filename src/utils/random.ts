/** Unit interval [0, 1) */
export function randomUnit(): number {
  return Math.random();
}

export function randomRange(min: number, max: number): number {
  return min + (max - min) * Math.random();
}
