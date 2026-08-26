// The box an anchored list is drawn in, and the world behind it. Where it goes
// is ./anchored-panel and how it takes the keyboard is ./anchored-keys.

import type { ReactNode } from 'react';
import { Pressable, type Role, ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import type { AnchorPlacement } from '#ui/lib/anchor';
import type { PanelScroll } from '#ui/lib/anchored-keys';
import { PANEL_BACKDROP, PANEL_SHELL } from '#ui/lib/anchored-panel';
import { Portal } from '#ui/lib/portal';
import { useTDefault } from '#ui/services/i18n';

const PAD = 6;
const RADIUS = 'xl';

interface AnchoredPopupProps {
  at: AnchorPlacement;
  role: Role;
  label: string | undefined;
  listId: string;
  onDismiss: () => void;
  scroll?: PanelScroll;
  children: ReactNode;
}

function AnchoredPopup({
  at,
  role,
  label,
  listId,
  onDismiss,
  scroll,
  children,
}: Readonly<AnchoredPopupProps>) {
  const t = useTDefault();
  return (
    <Portal>
      <Pressable
        accessibilityLabel={t('common.close')}
        tabIndex={-1}
        onPress={onDismiss}
        style={PANEL_BACKDROP}
      />
      <Box
        nativeID={listId}
        role={role}
        accessibilityLabel={label}
        radius={RADIUS}
        border="borderStrong"
        bg="surface2"
        shadow="pop"
        overflow="hidden"
        style={[
          PANEL_SHELL,
          {
            left: at.left,
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
