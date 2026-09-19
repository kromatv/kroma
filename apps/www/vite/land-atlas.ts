import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Feature, MultiPolygon } from 'geojson';
import { feature } from 'topojson-client';
import { z } from 'zod';

const ATLAS = 'world-atlas/land-110m.json';

const Position = z.tuple([z.number(), z.number()]);

const Landmasses = z.object({
  type: z.literal('MultiPolygon'),
  arcs: z.array(z.array(z.array(z.number()))),
});

const LandTopology = z.object({
  type: z.literal('Topology'),
  transform: z.object({ scale: Position, translate: Position }).optional(),
  arcs: z.array(z.array(Position)),
  objects: z.object({
    land: z.object({ type: z.literal('GeometryCollection'), geometries: z.tuple([Landmasses]) }),
  }),
});

/**
 * The world's landmasses at 1:110m (Natural Earth, by way of world-atlas),
 * resolved against the package at `root` so the build reads the copy it
 * declares rather than whichever one is nearest on disk.
 */
export async function loadLand(root: string): Promise<Feature<MultiPolygon>> {
  const path = createRequire(join(root, 'package.json')).resolve(ATLAS);
  const topology = LandTopology.parse(JSON.parse(await readFile(path, 'utf8')));
  return feature(topology, topology.objects.land.geometries[0]);
}
