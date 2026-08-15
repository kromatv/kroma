import { useRef } from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';
import { ARROW } from '#ui/lib/cursor';
import { WEB } from '#ui/lib/platform';
import { useTDefault } from '#ui/services/i18n';

/**
 * The press-anywhere-out-there way out of an overlay, for the surface to place
 * behind its panel.
 *
 * Web only: on a TV, Back/Menu is the platform's way out and an extra Pressable
 * is one more thing for the D-pad to land on. Draws nothing without `onPress`.
 */
function DismissBackdrop({ onPress }: Readonly<{ onPress?: () => void }>) {
  const t = useTDefault();
  const backdrop = useRef<View>(null);
  if (!onPress || !WEB) return null;
  return (
    <Pressable
      ref={backdrop}
      accessibilityLabel={t('common.close')}
      onPress={onPress}
      // The backdrop must never hold the DOM focus: react-native-web 0.21's
      // Pressable ignores `focusable` and defaults to `tabindex="0"`, and
      // <Modal>'s focus trap focuses the first node inside it on open. A
      // browser TV shell then delivers the remote's OK as Enter on that
      // element, closing the dialog instead of choosing the ringed row.
      tabIndex={-1}
      onFocus={() => (backdrop.current as unknown as HTMLElement | null)?.blur()}
      // A backdrop is pressable so a click outside dismisses, but it is not a
      // control anyone aims at: the hand would invite a press on the whole page.
      style={[StyleSheet.absoluteFill, ARROW]}
    />
  );
}

export { DismissBackdrop };
