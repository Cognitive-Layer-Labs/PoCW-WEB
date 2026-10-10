// Minimal typings for the one d3-force-3d export we use (the package ships no types).
declare module "d3-force-3d" {
  interface CollideForce<N> {
    (alpha: number): void;
    radius(radius: number | ((node: N) => number)): CollideForce<N>;
    strength(strength: number): CollideForce<N>;
    iterations(iterations: number): CollideForce<N>;
  }
  export function forceCollide<N = unknown>(radius?: number | ((node: N) => number)): CollideForce<N>;
}
