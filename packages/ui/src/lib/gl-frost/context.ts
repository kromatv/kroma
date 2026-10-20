import { createContext, useContext, useSyncExternalStore } from 'react';
import { useKitSettings } from '#ui/lib/kit-settings';

/** What a frost layer offers the surfaces and scrollers drawn over it. */
export interface FrostLayer {
  /** Draws the frost under the element `mark` sits in, until the returned call. */
  register(mark: HTMLElement): () => void;
  /** Scrolls `scroller` (a ScrollView ref) to `offset` in step with the frost;
   *  false where the layer cannot, and the caller scrolls it itself. */
  glide(scroller: unknown, horizontal: boolean, offset: number): boolean;
}

/** The frost layer of the nearest `<FrostSource>` that draws one. */
export const FrostLayerContext = createContext<FrostLayer | null>(null);

const NONE = () => () => {};
const NOTHING = () => null;

/** The frost layer under this surface: its `<FrostSource>`'s, else the one the
 *  app draws now, else null where no layer draws the frost. */
export function useFrostLayer(): FrostLayer | null {
  const near = useContext(FrostLayerContext);
  const { frostHost } = useKitSettings();
  const drawn = useSyncExternalStore(
    frostHost?.subscribe ?? NONE,
    frostHost?.current ?? NOTHING,
    NOTHING,
  );
  return near ?? drawn;
}

/** Where a scroller asks its `<FrostSource>` to glide it; never the app's. */
export function useFrostGlide(): FrostLayer | null {
  return useContext(FrostLayerContext);
}
