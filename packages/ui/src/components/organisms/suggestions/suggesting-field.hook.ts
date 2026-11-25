import { type ReactNode, useMemo, useState } from 'react';
import { type ControlSize, useEntryDefaults } from '#ui/lib/field-shell';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import {
  type SurfacePresentation,
  useSurfacePresentation,
} from '#ui/lib/surface-presentation.hook';
import { entryMetrics } from './entry-metrics';
import type { SuggestingField } from './suggestion-context';

interface SuggestingAt {
  query: string;
  size?: ControlSize;
  presentation?: SurfacePresentation;
  take: (name: string) => unknown;
}

function useRememberedFaces() {
  const [faces, setFaces] = useState<ReadonlyMap<string, ReactNode>>(() => new Map());
  const remember = useStableCallback((name: string, face: ReactNode) => {
    if (face !== null && faces.get(name) !== face) {
      setFaces((held) => new Map(held).set(name, face));
    }
  });
  return { faces, remember };
}

/** What a field publishes to its suggestions, its measures at its shell size,
 *  and the faces names were picked with: a pick remembers its face, then hands
 *  the name to `take`. */
function useSuggestingField({ query, size, presentation, take }: Readonly<SuggestingAt>) {
  const { faces, remember } = useRememberedFaces();
  const resolved = useSurfacePresentation(presentation);
  const entry = useEntryDefaults();
  const metrics = entryMetrics(size ?? entry.size);
  const pick = useStableCallback((name: string, face: ReactNode) => {
    remember(name, face);
    take(name);
  });
  const { rowMedia } = metrics;
  const field = useMemo<SuggestingField>(
    () => ({ query, rowMedia, presentation: resolved, pick }),
    [query, rowMedia, resolved, pick],
  );
  return { field, faces, metrics };
}

export { useSuggestingField };
