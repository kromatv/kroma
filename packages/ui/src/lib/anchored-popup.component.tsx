// The box an anchored list is drawn in, and the world behind it. Where it goes
// is ./anchored-panel and how it takes the keyboard is ./anchored-keys.

import type { ReactNode, RefObject } from 'react';
import { Pressable, type Role, ScrollView, type ViewProps } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import type { AnchorPlacement } from '#ui/lib/anchor';
import type { PanelScroll } from '#ui/lib/anchored-keys.hook';
import { PANEL_BACKDROP, PANEL_SHELL } from '#ui/lib/anchored-panel';
import { useOutsidePress } from '#ui/lib/outside-press.hook';
import { Portal } from '#ui/lib/portal.component';
import { useTDefault } from '#ui/services/i18n';

const PAD = 6;
const RADIUS = 'xl';

// react-native-web forwards the attribute; React Native's own accessibility
// props stop short of it, which is why the shape is asserted rather than typed.
const MULTISELECTABLE: ViewProps = { 'aria-multiselectable': true };

/** The role of an anchored list of options. react-native-web forwards it to
 *  the DOM even though React Native's `Role` union stops short of it. */
export const LISTBOX = 'listbox' as Role;

interface AnchoredPopupProps {
  at: AnchorPlacement;
  role: Role;
  label: string | undefined;
  multiselectable?: boolean;
  listId: string;
  onDismiss: () => void;
  within?: RefObject<unknown>;
  scroll?: PanelScroll;
  children: ReactNode;
}

function AnchoredPopup({
  at,
  role,
  label,
  multiselectable = false,
  listId,
  onDismiss,
  within,
  scroll,
  children,
}: Readonly<AnchoredPopupProps>) {
  const t = useTDefault();
  const passing = useOutsidePress({ within, listId, onOutside: onDismiss });
  return (
    <Portal>
      {passing ? null : (
        <Pressable
          accessibilityLabel={t('common.close')}
          tabIndex={-1}
          onPress={onDismiss}
          style={PANEL_BACKDROP}
        />
      )}
      <Box
        {...(multiselectable ? MULTISELECTABLE : null)}
        nativeID={listId}
        role={role}
        accessibilityLabel={label}
        radius={RADIUS}
        border="borderStrong"
        bg="surface2"
        overflow="hidden"
        style={[
          PANEL_SHELL,
          {
            left: at.left,
            right: at.right,
            top: at.top,
            bottom: at.bottom,
            minWidth: at.width,
            maxWidth: at.maxWidth,
          },
        ]}
      >
        <ScrollView {...scroll} scrollEventThrottle={16} style={{ maxHeight: at.maxHeight }}>
          <Box p={PAD}>{children}</Box>
        </ScrollView>
      </Box>
    </Portal>
  );
}

export type { AnchoredPopupProps };
export { AnchoredPopup };
