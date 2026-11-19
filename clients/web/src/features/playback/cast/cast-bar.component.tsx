// The docked remote, pinned to the bottom of the app shell while this browser
// drives a TV. Three zones: what is playing, the remote, and the television
// being driven. It shows what the TV last reported, not what was last asked of
// it, with the position interpolated between the receiver's heartbeats.

import type { CastReceiver } from '@kromatv/client/cast';
import type { MediaItem } from '@kromatv/client/media';
import { type Cast, castRowState, useCast, useT } from '@kromatv/ui';
import {
  Box,
  breakpoint,
  Button,
  classes,
  Img,
  Row,
  Spinner,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useWindowDimensions } from 'react-native';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { castPicker } from '#web/shared/ui/cast-picker.component';
import { CastRemote } from './cast-remote.component';
import { TransportButton } from './transport-button.component';

/** `inset` is the width the app's rail takes on the left, which the bar stays
 * clear of. Default 0. */
export function CastBar({ inset = 0 }: Readonly<{ inset?: number }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const cast = useCast();
  const { active, send, select } = cast;
  const wide = useWindowDimensions().width >= breakpoint.md;

  if (!active) {
    return null;
  }

  const stop = () => {
    void send({ type: 'stop' });
    select(null);
  };

  return (
    <aside
      aria-label={t('cast.playingOn', { device: active.name })}
      className={classes(s.bar)}
      style={{ left: inset }}
    >
      <Row w="100%" gap={16} px={20} py={12}>
        <Row gap={12} style={s.side}>
          <NowPlaying item={active.nowPlaying?.item} />
        </Row>
        <Box style={s.middle}>
          <Middle active={active} cast={cast} scrub={wide} />
        </Box>
        <Row gap={8} style={[s.side, s.end]}>
          {wide ? <DeviceButton name={active.name} onSelect={select} /> : null}
          <TransportButton icon="player-stop-filled" label={t('cast.stop')} onPress={stop} />
        </Row>
      </Row>
    </aside>
  );
}

function secondLine(item: MediaItem): string {
  if (item.showTitle) {
    const number = item.season && item.episode ? ` · S${item.season}E${item.episode}` : '';
    return `${item.showTitle}${number}`;
  }
  return item.year ? String(item.year) : '';
}

function NowPlaying({ item }: Readonly<{ item?: MediaItem }>) {
  const webRuntime = useWebRuntime();
  if (!item) {
    return null;
  }
  const poster = webRuntime.client.media.artwork.posterFor(item, 96);
  return (
    <>
      {poster ? (
        <Box w={32} h={48} shrink={0}>
          <Img src={poster} radius="sm" fill />
        </Box>
      ) : null}
      <Box minW={0}>
        <Text variant="label" lines={1}>
          {item.metadata?.title ?? item.title}
        </Text>
        <Text variant="meta" color="textMuted" lines={1}>
          {secondLine(item)}
        </Text>
      </Box>
    </>
  );
}

interface MiddleProps {
  active: CastReceiver;
  cast: Cast;
  scrub: boolean;
}

// What the middle of the bar is, by what the television is doing: coming back,
// waiting for somebody to switch it on, idle, or playing.
function Middle({ active, cast, scrub }: Readonly<MiddleProps>) {
  const t = useT();
  const state = castRowState(active, cast);
  if (state === 'needsPower') {
    return <Notice>{t('cast.needsPower')}</Notice>;
  }
  if (state === 'waking') {
    return (
      <Row gap={10}>
        <Spinner size={18} />
        <Notice>{t('cast.waking')}</Notice>
      </Row>
    );
  }
  if (!active.nowPlaying) {
    return <Notice>{t('cast.idleHint', { device: active.name })}</Notice>;
  }
  return (
    <CastRemote
      playing={active.nowPlaying}
      positionMs={cast.positionMs}
      send={cast.send}
      scrub={scrub}
    />
  );
}

function Notice({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="meta" color="textMuted" textAlign="center" lines={2}>
      {children}
    </Text>
  );
}

function DeviceButton({ name, onSelect }: Readonly<{ name: string; onSelect: Cast['select'] }>) {
  return (
    <Button
      variant="glass"
      size="sm"
      icon="cast"
      label={name}
      onPress={async () => {
        const picked = await castPicker({ offerLocal: true });
        if (picked !== undefined) {
          onSelect(picked);
        }
      }}
    />
  );
}

const sDefinition = styles({
  bar: {
    position: 'fixed',
    right: 0,
    bottom: 0,
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 0,
    borderTopWidth: 1,
    borderStyle: 'solid',
    borderTopColor: 'border',
    bg: 'surface1/95',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
  side: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  end: { justifyContent: 'flex-end' },
  middle: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center' },
});
