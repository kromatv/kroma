// The device list itself: which screen should this play on.
//
// Shared between the bottom sheet (<CastSheet>) and the player's own panel
// (<CastPanel>): the player is a native fullScreenModal, and @gorhom's sheet
// renders into a host that sits behind it.

import type { CastReceiver, DiscoveredTv, FinalRefusal, GrantResult } from '@kroma/core';
import { checkRetryable, grantRefusal } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Box, Icon, styles, Text } from '@kroma/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';
import { CheckPrompt } from '#mobile/components/connect/CheckPrompt';
import { SheetTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

export interface CastDeviceListProps {
  onPick: (receiverId: string | null) => void;
  offerLocal?: boolean;
}

// Every ending is its own word. Two of them reading the same was a bug: a code
// that was refused looked exactly like a television that had signed in.
type PairingState = 'signingIn' | 'done' | FinalRefusal;

interface Attempt {
  handle: string;
  state: PairingState;
}

export function CastDeviceList({ onPick, offerLocal = true }: Readonly<CastDeviceListProps>) {
  const t = useT();
  const client = useClient();
  const { receivers, active, pairable } = useCast();
  // A television with no account cannot be cast to, and saying "none available"
  // with one in the room is the dead end this answers. The provider already
  // found it; the one useful thing to add here is the act of signing it in.
  //
  // Deliberately NOT `useNearbyTvs`: that hook does its own looking, and this
  // list is rendered inside a provider that is already looking.
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [asking, setAsking] = useState<DiscoveredTv | null>(null);
  // A grant at a time, read through a ref because two taps can land inside one
  // render: a second one in flight would settle the row of the first.
  const granting = useRef(false);
  const grant = useCallback(
    async (tv: DiscoveredTv, check?: string): Promise<GrantResult> => {
      if (granting.current) return 'dropped';
      granting.current = true;
      setAttempt({ handle: tv.handle, state: 'signingIn' });
      try {
        await client.handoffGrant(tv.handle, { proof: tv.proof, check });
        setAttempt({ handle: tv.handle, state: 'done' });
        setAsking(null);
        return 'granted';
      } catch (cause) {
        const refusal = grantRefusal(cause);
        // A code that can be retyped is the prompt's to report; the row is only
        // told about an ending it has to keep.
        if (checkRetryable(refusal)) {
          setAttempt(null);
          // A row this picker believed needed no code, and the server says
          // otherwise: ask for it rather than leave a tap that did nothing.
          if (refusal === 'checkRequired') setAsking(tv);
          return refusal;
        }
        setAttempt({ handle: tv.handle, state: refusal });
        setAsking(null);
        return refusal;
      } finally {
        granting.current = false;
      }
    },
    [client],
  );

  // A row the server never placed asks for the code that television is printing
  // before it hands anybody an account. Everything the picker hears on the link
  // is such a row, since nothing here has the server's word on any of them.
  const start = (tv: DiscoveredTv) => {
    if (tv.confirmRequired) {
      setAsking(tv);
      return;
    }
    void grant(tv);
  };

  if (asking) {
    return (
      <>
        <SheetTitle>{t('cast.title')}</SheetTitle>
        <CheckPrompt device={asking} onGrant={grant} onCancel={() => setAsking(null)} />
      </>
    );
  }

  return (
    <>
      <SheetTitle>{t('cast.title')}</SheetTitle>

      {offerLocal ? (
        <DeviceRow
          icon="device-mobile"
          name={t('cast.thisDevice')}
          // Say which of the two it is: leaving a TV behind is a different act
          // from choosing where to start something.
          detail={active ? t('cast.disconnect') : t('cast.playHere')}
          selected={!active}
          onPress={() => onPick(null)}
        />
      ) : null}

      {receivers.map((r) => (
        <DeviceRow
          key={r.id}
          icon="device-tv"
          name={r.name}
          detail={detailOf(r, t)}
          selected={active?.id === r.id}
          onPress={() => onPick(r.id)}
        />
      ))}

      {pairable.map((tv) => {
        const state = attempt?.handle === tv.handle ? attempt.state : null;
        return (
          <DeviceRow
            key={tv.handle}
            icon="device-tv"
            name={tv.name}
            detail={detailOfPairable(state, t)}
            selected={false}
            // A granted beacon is spent: the server mints a new handle when that
            // television waits again, so this row will never be the one to tap.
            onPress={state === 'done' ? undefined : () => start(tv)}
          />
        );
      })}

      {receivers.length === 0 && pairable.length === 0 ? (
        <NoDevices />
      ) : (
        // Shown even with devices already listed: the roster is live, so a
        // second receiver can still appear below.
        <Box style={s.searchingRow}>
          <Searching />
        </Box>
      )}
    </>
  );
}

// Not a dead end: the roster stays live, so a device that wakes up appears
// here without reopening the picker.
function NoDevices() {
  const t = useT();

  return (
    <Box style={s.empty}>
      <Box style={s.emptyDisc}>
        <Icon name="device-tv" size={34} thickness={1.4} color="textMuted" />
      </Box>
      <Text style={s.emptyTitle}>{t('cast.noDevices')}</Text>
      <Text style={s.emptyHint}>{t('cast.noDevicesHint')}</Text>
      <Searching />
    </Box>
  );
}

function Searching() {
  const t = useT();
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Box style={s.searching}>
      <Animated.View style={[s.searchingDot, { opacity: pulse }]} />
      <Text style={s.searchingLabel}>{t('cast.searching')}</Text>
    </Box>
  );
}

function detailOfPairable(state: PairingState | null, t: ReturnType<typeof useT>): string {
  if (state === 'signingIn') return t('handoff.connecting');
  if (state === 'done') return t('handoff.rowDone');
  if (state === 'gone') return t('handoff.gone');
  if (state === 'checkTooMany') return t('handoff.checkTooMany');
  return t('cast.signInThisTv');
}

function detailOf(r: CastReceiver, t: ReturnType<typeof useT>): string {
  const playing = r.nowPlaying?.item;
  if (playing) return playing.metadata?.title ?? playing.title;
  return `${r.username} · ${t('cast.idle')}`;
}

function DeviceRow({
  icon,
  name,
  detail,
  selected,
  onPress,
}: Readonly<{
  icon: 'device-tv' | 'device-mobile';
  name: string;
  detail: string;
  selected: boolean;
  onPress?: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Icon name={icon} size={24} thickness={1.8} color={selected ? 'accentText' : 'text'} />
      <Box style={s.rowText}>
        <Text lines={1} style={[s.rowName, selected && s.rowNameActive]}>
          {name}
        </Text>
        <Text lines={1} style={s.rowDetail}>
          {detail}
        </Text>
      </Box>
      {selected ? <Icon name="check" size={20} thickness={2.4} color="accentText" /> : null}
    </Pressable>
  );
}

const s = styles({
  row: { row: true, align: 'center', gap: spacing.sm, minH: 56, px: spacing.sm, radius: radius.md },
  rowText: { flex: true },
  rowName: { ...type.body, color: 'text', fontWeight: '600' },
  rowNameActive: { color: 'accentText' },
  rowDetail: { ...type.caption, color: 'textMuted' },
  empty: { align: 'center', gap: 6, pt: spacing.md, pb: spacing.lg },
  searchingRow: { align: 'center' },
  emptyDisc: { center: true, w: 84, h: 84, mb: spacing.sm, bg: 'surface3', radius: 42 },
  emptyTitle: { ...type.section, color: 'text', textAlign: 'center' },
  emptyHint: {
    ...type.caption,
    maxW: 300,
    color: 'textMuted',
    textAlign: 'center',
    lineHeight: 20,
  },
  searching: {
    row: true,
    align: 'center',
    gap: 8,
    px: 14,
    py: 8,
    mt: spacing.md,
    // The surfaces around it are `surfaceRaised`; a pill in the same fill is no pill.
    bg: 'surface3',
    radius: radius.pill,
  },
  searchingDot: { w: 7, h: 7, bg: 'accent', radius: 4 },
  searchingLabel: { ...type.small, color: 'textMuted' },
});
