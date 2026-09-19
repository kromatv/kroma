export type Vector = [number, number, number];

/** Tenths of a degree: how `virtual:kroma-land` stores a coordinate. */
export const LAND_SCALE = 10;

const RADIANS = Math.PI / 180;

/**
 * A point on a sphere of `radius`: the equator in the XZ plane, the poles on Y,
 * the prime meridian facing +Z, which is where the globe's camera sits.
 */
export function toVector(lat: number, lng: number, radius = 1): Vector {
  const phi = lat * RADIANS;
  const theta = lng * RADIANS;
  const ring = Math.cos(phi) * radius;
  return [ring * Math.sin(theta), Math.sin(phi) * radius, ring * Math.cos(theta)];
}

/** `[lat, lng]` pairs in tenths of a degree, as xyz triples on the unit sphere. */
export function decodeLand(points: readonly number[]): Float32Array {
  const out = new Float32Array(Math.floor(points.length / 2) * 3);
  for (let i = 0; i + 1 < points.length; i += 2) {
    const lat = points[i];
    const lng = points[i + 1];
    if (lat === undefined || lng === undefined) break;
    out.set(toVector(lat / LAND_SCALE, lng / LAND_SCALE), (i / 2) * 3);
  }
  return out;
}
