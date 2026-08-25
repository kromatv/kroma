import { useT } from '@kroma/ui';
import { IconButton, type IconName, Menu } from '@kroma/ui/kit';

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

function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function stopActivation(event: { key: string; stopPropagation: () => void }) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
}

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

/** Nothing at all when `actions` is empty. */
export function PosterActionBar({ actions }: Readonly<{ actions: readonly PosterAction[] }>) {
  const t = useT();
  if (actions.length === 0) return null;
  const overflow = actions.length > INLINE + 1 ? actions.slice(INLINE) : [];
  const discs = overflow.length > 0 ? actions.slice(0, INLINE) : actions;
  return (
    <div
      className="poster-actions"
      role="toolbar"
      aria-label={t('content.quickActions')}
      onClick={stop}
      onKeyDown={stopActivation}
      onPointerDown={stop}
    >
      {discs.map((action) => (
        <ActionDisc key={action.key} action={action} />
      ))}
      {overflow.length > 0 ? <Overflow actions={overflow} /> : null}
    </div>
  );
}
