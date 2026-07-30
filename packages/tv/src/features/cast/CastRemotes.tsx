import { useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  Button,
  colors,
  Dialog,
  DialogFooter,
  Focusable,
  FocusColumn,
  Icon,
  ListRow,
  Txt,
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
        label={t('cast.remotes')}
        focusScale={1.08}
        style={CHIP_FOCUS}
      >
        <Box row align="center" gap={8} h={36} px={12} radius="pill" style={CHIP}>
          <Icon name="cast" size={19} stroke={2} color="accent" />
          <Txt style={COUNT}>{count}</Txt>
        </Box>
      </Focusable>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('cast.remotes')}
        description={t('cast.remotesHint')}
        width={PANEL_WIDTH}
        footer={
          <DialogFooter>
            <Button variant="ghost" label={t('common.close')} onPress={() => setOpen(false)} />
          </DialogFooter>
        }
      >
        {/* A column: <FocusRegion> is horizontal and lays several rows out side
            by side, the second landing outside the panel. */}
        <FocusColumn style={LIST}>
          {controllers.map((remote, i) => (
            <ListRow
              key={remote.id}
              leading={
                <Avatar
                  name={remote.username}
                  seed={remote.username}
                  size={44}
                  roundness={0.35}
                  src={client?.resolveArt(remote.avatarUrl ?? undefined)}
                />
              }
              label={remote.username}
              hint={remote.name}
              autoFocus={i === 0}
              onPress={() => kickCastController(remote.id)}
              trailing={
                <Box row align="center" gap={8}>
                  <Icon name="plug-off" size={20} stroke={2} color="textMuted" />
                  <Txt color="textMuted" style={ACTION}>
                    {t('cast.disconnect')}
                  </Txt>
                </Box>
              }
            />
          ))}
        </FocusColumn>
      </Dialog>
    </>
  );
}

const CHIP_FOCUS = { borderRadius: 999 } as const;

const CHIP = {
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  borderWidth: 1,
  borderColor: colors.accent,
} as const;

const COUNT = {
  fontSize: 16,
  fontWeight: '700' as const,
  fontVariant: ['tabular-nums' as const],
};

const LIST = { gap: 8 } as const;

const ACTION = { fontSize: 15, fontWeight: '600' as const };
