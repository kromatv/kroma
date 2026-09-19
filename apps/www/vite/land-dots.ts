import { geoBounds, geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { LAND_SCALE } from '../src/lib/geo.ts';

/** Rows of latitude between the poles, so 1.5° apart, and the dots along a row
 * as far apart as the rows are. */
export const DEFAULT_ROWS = 120;

type Bounds = [[number, number], [number, number]];

interface Landmass {
  polygon: Feature<Polygon>;
  bounds: Bounds;
}

const RADIANS = Math.PI / 180;

function landmasses(land: Feature<MultiPolygon>): Landmass[] {
  return land.geometry.coordinates.map((coordinates) => {
    const polygon: Feature<Polygon> = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Polygon', coordinates },
    };
    return { polygon, bounds: geoBounds(polygon) };
  });
}

// A landmass cut at the antimeridian bounds with west past east.
function within([[west, south], [east, north]]: Bounds, lng: number, lat: number): boolean {
  if (lat < south || lat > north) return false;
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}

function onLand(masses: readonly Landmass[], lng: number, lat: number): boolean {
  return masses.some(
    (mass) => within(mass.bounds, lng, lat) && geoContains(mass.polygon, [lng, lat]),
  );
}

/**
 * Where the globe's dots go: `rows` rings of latitude, each holding as many
 * dots as keeps them as far apart at the equator as at the poles, kept where
 * they fall on land. `[lat, lng]` pairs in tenths of a degree, the same lattice
 * every build.
 */
export function landDots(land: Feature<MultiPolygon>, rows = DEFAULT_ROWS): number[] {
  const masses = landmasses(land);
  const step = 180 / rows;
  const around = 360 / step;
  const dots: number[] = [];
  for (let row = 0; row < rows; row++) {
    const lat = -90 + step * (row + 0.5);
    const count = Math.max(1, Math.round(around * Math.cos(lat * RADIANS)));
    for (let i = 0; i < count; i++) {
      const lng = -180 + (360 / count) * (i + 0.5);
      if (onLand(masses, lng, lat)) {
        dots.push(Math.round(lat * LAND_SCALE), Math.round(lng * LAND_SCALE));
      }
    }
  }
  return dots;
}
