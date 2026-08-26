import { useT } from '@kroma/ui';
import { Box, IconButton, type IconName, Menu } from '@kroma/ui/kit';

export interface PosterAction {
  key: string;
  icon: IconName;
  label: string;
  onSelect: () => void;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}

const INLINE = 2;
const DISC = 32;
const GLYPH = 16;

function ActionDisc({ action }: Readonly<{ action: PosterAction }>) {
  return (
    <IconButton
      variant="scrim"
      active={action.active}
      diameter={DISC}
      glyph={GLYPH}
      icon={action.icon}
      label={action.label}
      pressed={action.pressed ?? action.active}
      disabled={action.disabled}
      onPress={action.onSelect}
    />
  );
}

function Overflow({ actions }: Readonly<{ actions: readonly PosterAction[] }>) {
  const t = useT();
  return (
    <Menu.Root label={t('content.moreActions')} align="end">
      <Menu.Trigger variant="scrim" diameter={DISC} glyph={GLYPH} />
      {actions.map((action) => (
        <Menu.Item
          key={action.key}
          icon={action.icon}
          label={action.label}
          disabled={action.disabled}
          onSelect={action.onSelect}
        />
      ))}
    </Menu.Root>
  );
}

export interface PosterActionBarProps {
  actions: readonly PosterAction[];
  shown: boolean;
}

/**
 * Nothing at all when `actions` is empty. Hidden with opacity rather than by
 * unmounting, so the discs stay in the tab order. The opacity steps between 0 and
 * 1 rather than fading: a box under 1 is a backdrop root, so a fade would leave
 * the discs' frost blind for its whole duration (@kroma/ui lib/css.web).
 */
export function PosterActionBar({ actions, shown }: Readonly<PosterActionBarProps>) {
  const t = useT();
  if (actions.length === 0) return null;
  const overflow = actions.length > INLINE + 1 ? actions.slice(INLINE) : [];
  const discs = overflow.length > 0 ? actions.slice(0, INLINE) : actions;
  return (
    <Box
      absolute
      top={8}
      right={8}
      z={2}
      gap={6}
      opacity={shown ? 1 : 0}
      pointerEvents={shown ? 'auto' : 'none'}
      role="toolbar"
      accessibilityLabel={t('content.quickActions')}
    >
      {discs.map((action) => (
        <ActionDisc key={action.key} action={action} />
      ))}
      {overflow.length > 0 ? <Overflow actions={overflow} /> : null}
    </Box>
  );
}
