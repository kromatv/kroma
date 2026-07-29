// The chrome every drawer in the app is drawn in.
//
// Each sheet used to spell out its own backdrop, its own surface, its own
// grabber and its own padding - the same four decisions, copied, and already
// drifted: the cast picker kept @gorhom's 15pt corners and its ~29pt grabber
// (the library sizes it as a share of the screen WIDTH), the language picker
// had 28pt corners and a 40pt one. One drawer surface now, in one place.
//
// The MINIMUM HEIGHT is why this file earns its keep. Sizing a sheet to its
// content is right for a list nobody can predict the length of, but a household
// with one Apple TV turned "Play on TV" into a two-row sliver pinned to the
// bottom bezel: a grabber with barely any sheet behind it to drag, a title
// squeezed against the first row, and the rows themselves down where the hand
// is rather than where the eye is. A content-sized drawer stops shrinking here.

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { type ReactNode, useMemo } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

/** The floor a content-sized drawer stops at ... */
const MIN_HEIGHT = 320;

/** ... except where 320pt would be most of the screen - a phone lying on its
 *  side, or a small one. A drawer that swallows what it is about is a page. */
const MIN_SHARE = 0.42;

/** That floor, for the screen the app is actually on. */
export function useSheetMinHeight(): number {
  const { height } = useWindowDimensions();
  return Math.min(MIN_HEIGHT, Math.round(height * MIN_SHARE));
}

/** The dimmed, tap-to-dismiss backdrop. A component rather than the `useCallback`
 *  every sheet used to carry: one identity, and one place to change what
 *  dismissing a drawer feels like. */
export function SheetBackdrop(props: Readonly<BottomSheetBackdropProps>) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

/**
 * The body of a content-sized drawer: the app's gutters, clearance for the home
 * indicator, and the floor under the whole thing.
 *
 * FLATTENED, and it has to be: <BottomSheetView> hands an array style to
 * `StyleSheet.compose(...style)`, and compose takes exactly TWO arguments - so a
 * third entry is dropped on the floor with no warning, which is a caller's
 * `style` override silently doing nothing. One object goes in.
 */
export function SheetBody({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  const minHeight = useSheetMinHeight();
  const body = useMemo(
    () =>
      StyleSheet.flatten([
        styles.body,
        { minHeight, paddingBottom: insets.bottom + spacing.md },
        style,
      ]),
    [minHeight, insets.bottom, style],
  );
  return <BottomSheetView style={body}>{children}</BottomSheetView>;
}

/** A drawer's title, and the air under it - which is the title's, not the
 *  list's, so it cannot be forgotten by whatever gets listed underneath. Eight
 *  points was the old gap everywhere, and it read as a label stuck to the first
 *  row rather than as the question the rows answer. */
export function SheetTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  /** Wider than the library's default, which is the grab target as much as it
   *  is the ornament. */
  grabber: { backgroundColor: colors.textFaint, width: 40 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { ...type.title, color: colors.text, marginBottom: spacing.md },
});

/** What every `<BottomSheetModal>` in the app spreads. Declared after the
 *  stylesheet it reads, which is the only reason it sits at the bottom. */
export const sheetChrome = {
  backdropComponent: SheetBackdrop,
  backgroundStyle: styles.surface,
  handleIndicatorStyle: styles.grabber,
};
