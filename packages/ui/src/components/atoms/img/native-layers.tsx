import { Fragment, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { absoluteFill } from '#ui/core/tokens';
import { imageBackend } from '#ui/lib/image-backend';

interface Size {
  width: number;
  height: number;
}

interface NativeLayersArgs {
  src: string | null;
  under: string | null;
  alt: string;
  fit: 'cover' | 'contain';
  rect: { top: number; left: number; width: number; height: number } | null;
  duration: number;
  errored: boolean;
  opacity: Animated.Value;
  setNatural: (size: Size) => void;
  markLoaded: () => void;
  onLoad: (() => void) | undefined;
  onError: () => void;
}

function nativeLayers(at: Readonly<NativeLayersArgs>): ReactNode {
  const layer = at.rect ? { position: 'absolute' as const, ...at.rect } : absoluteFill;
  const mode = at.rect ? ('stretch' as const) : at.fit;
  const backend = imageBackend();
  // A backend that fades itself (expo-image) is left alone; one that doesn't
  // (React Native's <Image>) is cross-faded here instead.
  const leaf = (uri: string, animated: boolean) =>
    backend.render({
      uri,
      fit: mode,
      fadeMs: at.duration,
      accessibilityLabel: at.alt || undefined,
      onLoad: (size: Size | null) => {
        if (size) at.setNatural(size);
        at.markLoaded();
        if (!backend.fades) {
          Animated.timing(at.opacity, {
            toValue: 1,
            duration: at.duration,
            useNativeDriver: true,
          }).start();
        }
        at.onLoad?.();
      },
      onError: at.onError,
      // ALWAYS the driven value, never a bare number: swapping between
      // `{ opacity: 0 }` and `{ opacity: <value> }` changes the style's shape,
      // and under Fabric a native-driven animation on a prop JS just rewrote
      // does not run at all.
      style: [layer, animated && !backend.fades ? { opacity: at.opacity } : null],
    });

  return (
    <>
      {at.under && at.under !== at.src ? (
        <View key="under" style={layer}>
          {backend.render({ uri: at.under, fit: mode, fadeMs: 0, style: absoluteFill })}
        </View>
      ) : null}
      {at.src && !at.errored ? <Fragment key={at.src}>{leaf(at.src, true)}</Fragment> : null}
    </>
  );
}

export type { Size };
export { nativeLayers };
