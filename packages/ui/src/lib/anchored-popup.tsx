// The box an anchored list is drawn in, and the world behind it. Where it goes
// and how it takes the keyboard is ./anchored-panel; this is only what the
// panel looks like, which a select's listbox and a menu's items had written
// twice between them.

import type { ReactNode, Ref } from 'react';
import { Pressable, type Role, ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import type { AnchorPlacement } from '#ui/lib/anchor';
import { PANEL_BACKDROP, PANEL_SHELL } from '#ui/lib/anchored-panel';
import { Portal } from '#ui/lib/portal';
import { useTDefault } from '#ui/services/i18n';

const PAD = 6;
// Concentric with the rows inside it: the row radius plus PAD.
const RADIUS = 'xl';

interface AnchoredPopupProps {
  at: AnchorPlacement;
  /** The list's own role: `listbox` for a select, `menu` for a menu. */
  role: Role;
  label: string | undefined;
  /** What the trigger's `aria-controls` and `aria-activedescendant` point at. */
  listId: string;
  onDismiss: () => void;
  /** The scroller, for a panel that keeps its active row in sight. */
  scrollRef?: Ref<ScrollView>;
  children: ReactNode;
}

function AnchoredPopup({
  at,
  role,
  label,
  listId,
  onDismiss,
  scrollRef,
  children,
}: Readonly<AnchoredPopupProps>) {
  const t = useTDefault();
  return (
    <Portal>
      {/* The world behind the panel: one press anywhere out there closes it. */}
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
        <ScrollView ref={scrollRef} style={{ maxHeight: at.maxHeight }}>
          <Box p={PAD}>{children}</Box>
        </ScrollView>
      </Box>
    </Portal>
  );
}

export type { AnchoredPopupProps };
export { AnchoredPopup };
