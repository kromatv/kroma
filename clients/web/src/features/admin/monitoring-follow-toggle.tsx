import { useT } from '@kromatv/ui';
import { Icon, IconButton, Tooltip } from '@kromatv/ui/kit';

export type FollowState = 'on' | 'partly' | 'off';

const GLYPH = { on: 'radar', partly: 'radar-2', off: 'radar-off' } as const;

/** The one control that switches following. Its accessible name is what
 * pressing it DOES, so a reader hears the action and not the state. */
export function FollowToggle({
  state,
  name,
  busy,
  disabled,
  reason,
  onToggle,
}: Readonly<{
  state: FollowState;
  name: string;
  busy?: boolean;
  disabled?: boolean;
  reason?: string;
  onToggle: (next: boolean) => void;
}>) {
  const t = useT();
  const label =
    reason ??
    t(state === 'on' ? 'monitoring.unfollowTitle' : 'monitoring.followTitle', { title: name });
  return (
    <Tooltip label={label}>
      <IconButton
        control="sm"
        variant="ghost"
        pressed={state === 'on'}
        busy={busy}
        inert={busy}
        disabled={disabled}
        label={label}
        onPress={() => onToggle(state !== 'on')}
      >
        <Icon name={GLYPH[state]} size={18} color={state === 'off' ? 'textDim' : 'accentText'} />
      </IconButton>
    </Tooltip>
  );
}
