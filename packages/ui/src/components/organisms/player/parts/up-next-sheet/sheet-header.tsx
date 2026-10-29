import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { IconCollapse } from '#ui/components/organisms/player/parts/icons';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles } from '#ui/core/tokens';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { FocusRegion } from '#ui/lib/focus-scope';
import { usePointerDriving } from '#ui/lib/input-source';

const sDefinition = styles({
  sheetTitle: { font: 'display', fontSize: textRoles.h2.size, fontWeight: '700' },
  headerRow: { row: true },
  headerBox: { flex: true, px: 56, pt: 28, pb: 18 },
  chevronOpen: { transform: [{ rotate: '0deg' }] },
  chevronClosed: { transform: [{ rotate: '180deg' }] },
});

/** The sheet's title row: the way out of an open sheet, and a pointer's way in. */
export function SheetHeader({
  open,
  title,
  onToggle,
}: Readonly<{ open: boolean; title: string; onToggle: () => void }>) {
  const s = useStyles(sDefinition);

  // Arriving here on the remote closes the sheet, so ▲ off the top row is one
  // press and not two - the header is the way out, not a stop on the way. Only
  // on the remote: a cursor sweeping over it must not close anything, and the
  // navigator focuses on mouse-enter (see lib/input-source).
  const pointerDriving = usePointerDriving();
  const leave = () => {
    if (!pointerDriving()) onToggle();
  };
  const inside = (
    <Box row align="center" gap={14}>
      <Text style={s.sheetTitle}>{title}</Text>
      <Box style={open ? s.chevronOpen : s.chevronClosed}>
        <Chevron />
      </Box>
    </Box>
  );
  // Parked, the sheet is a picture and the chrome owns the remote, so the header
  // is pointer-only. Open, it is where ▲ off the top row goes and how a remote
  // closes the sheet without Back.
  return (
    <FocusRegion style={s.headerRow}>
      <Focusable
        label={title}
        onPress={onToggle}
        onFocus={open ? leave : undefined}
        // Registered while parked so it keeps its place ABOVE the grid (the
        // navigator fixes a node's order when it mounts). It spans the sheet, so
        // a ring would be cut by the sheet's edges.
        ring={false}
        focusScale={1}
        style={[s.headerBox, NO_OUTLINE]}
      >
        {inside}
      </Focusable>
    </FocusRegion>
  );
}

function Chevron() {
  return <IconCollapse size={20} thickness={2.2} color="accentText" />;
}
