// The remotes driving this television, in the top bar's status cluster.
//
// A set that can be driven from a phone should say so on the screen everyone in
// the room is looking at - and whoever holds the actual remote has to be able to
// take it back. So: a chip next to the connection dot while at least one phone
// or browser is attached, and a list behind it that hangs up on any of them.
//
// It is deliberately not a settings screen. Disconnecting is one press on a row,
// with no confirmation, because it is not destructive - the phone can simply
// connect again - and because the case for pressing it is somebody standing up
// mid-film to make the meddling stop.

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

/** Matches <Dialog>'s own padding, so the rows sit on the panel's measure. */
const PANEL_WIDTH = 620;

export function CastRemotes() {
  const t = useT();
  const { client } = useConnection();
  const controllers = useCastControllers();
  const [open, setOpen] = useState(false);
  const count = controllers.length;

  // Disconnecting the last one leaves an empty list under a title about a thing
  // that is no longer happening - and the chip that opened it is gone too, so
  // there is nothing to return focus to. Close it ourselves.
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
        {/* A COLUMN: <FocusRegion> is the horizontal one, and with more than a
            single remote attached it laid the rows out side by side - the
            second one landing outside the panel entirely. */}
        <FocusColumn style={LIST}>
          {controllers.map((remote, i) => (
            <ListRow
              key={remote.id}
              // The person first, the device under it - the same reading as the
              // notice that announced them.
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
              // The row IS the disconnect, so it says so: a chevron here would
              // promise a screen behind it that does not exist.
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
