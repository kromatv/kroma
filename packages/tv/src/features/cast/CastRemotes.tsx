import { useT } from '@kroma/ui';
import {
  Avatar,
  Button,
  Dialog,
  Focusable,
  FocusColumn,
  Icon,
  ListRow,
  styles,
  sv,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { kickCastController, useCastControllers } from '#tv/features/cast/controllers';

const PANEL_WIDTH = 620;

export function CastRemotes() {
  const t = useT();
  const { client } = useConnection();
  const controllers = useCastControllers();
  const [open, setOpen] = useState(false);
  const count = controllers.length;

  // With the last remote gone the chip that opened this dialog is gone too, so
  // there would be nothing left to return focus to.
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  if (count === 0) return null;

  return (
    <>
      <Focusable
        onPress={() => setOpen(true)}
        label={`${t('cast.remotes')} (${count})`}
        expanded={open}
        focusScale={1.08}
        sv={chip}
      >
        <Icon name="cast" size={19} thickness={2} color="accentText" />
        <Text variant="strongTv" style={s.count}>
          {count}
        </Text>
      </Focusable>

      <Dialog.Root
        open={open}
        onClose={() => setOpen(false)}
        title={t('cast.remotes')}
        description={t('cast.remotesHint')}
        width={PANEL_WIDTH}
      >
        {/* A column: <FocusRegion> is horizontal and lays several rows out side
            by side, the second landing outside the panel. */}
        <FocusColumn style={s.list}>
          {controllers.map((remote, i) => (
            <ListRow.Root
              key={remote.id}
              autoFocus={i === 0}
              onPress={() => kickCastController(remote.id)}
            >
              <ListRow.Label>{remote.username}</ListRow.Label>
              <ListRow.Hint>{remote.name}</ListRow.Hint>
              <ListRow.Leading>
                <Avatar
                  name={remote.username}
                  seed={remote.username}
                  size={44}
                  roundness={0.35}
                  src={client?.resolveArt(remote.avatarUrl ?? undefined, 44)}
                />
              </ListRow.Leading>
              <ListRow.Trailing>
                <Icon name="plug-off" size={20} thickness={2} color="textMuted" />
                <Text variant="labelTv" color="textMuted">
                  {t('cast.disconnect')}
                </Text>
              </ListRow.Trailing>
            </ListRow.Root>
          ))}
        </FocusColumn>
        <Dialog.Footer>
          <Dialog.Actions>
            <Button variant="ghost" label={t('common.close')} onPress={() => setOpen(false)} />
          </Dialog.Actions>
        </Dialog.Footer>
      </Dialog.Root>
    </>
  );
}

const chip = sv({
  base: {
    row: true,
    align: 'center',
    gap: 8,
    h: 36,
    px: 12,
    radius: 'pill',
    bg: 'black/45',
    border: 'accent',
  },
});

const s = styles({
  count: { fontVariant: ['tabular-nums'] },
  list: { gap: 8 },
});
