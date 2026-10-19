import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { createFrostTracker, type FrostTracker } from './frost-track';

/** The artwork a screen draws full-bleed, for a frosted surface on it to sample. */
export interface FrostSourceValue {
  src: string;
  position: string;
  veil: string | undefined;
  frame: RefObject<unknown>;
  tracker: FrostTracker;
}

const FrostSourceContext = createContext<FrostSourceValue | null>(null);

/** The artwork behind the nearest `<FrostSource>`, or null outside one. */
export function useFrostSource(): FrostSourceValue | null {
  return useContext(FrostSourceContext);
}

interface FrostSourceProps {
  /** A small rendition of the screen's backdrop (160 px wide is plenty). Null
   *  leaves the frosted surfaces on it with their plain fill. */
  src: string | null;
  /** The backdrop's CSS object-position, so the sample lines up with it.
   *  Defaults to `'50% 50%'`. */
  position?: string;
  /** The `<Veil>` ramp laid over the backdrop, baked into the sample. */
  veil?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * The frame a full-bleed backdrop fills. A `<Frost>` inside it draws the same
 * artwork, small and stretched, clipped to its own box, where the kit is
 * configured to sample rather than blur what is behind it.
 */
export function FrostSource({
  src,
  position = '50% 50%',
  veil,
  style,
  children,
}: Readonly<FrostSourceProps>) {
  const frame = useRef<View>(null);
  const [tracker] = useState(createFrostTracker);
  const value = useMemo(
    () => (src ? { src, position, veil, frame, tracker } : null),
    [src, position, veil, tracker],
  );
  return (
    <FrostSourceContext.Provider value={value}>
      <View ref={frame} style={style}>
        {children}
      </View>
    </FrostSourceContext.Provider>
  );
}
