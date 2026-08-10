// The televisions waiting on this network, one tap each. Everything it decides
// lives in `useNearbyTvs`; this brings the rows.
//
// Two ways of looking, not one: the server, and this phone's own link when the
// binary carries the native module. A television heard on the link can be signed
// in even where the server could not tell the two apart.
//
// Every row carries the check string that television is printing on its own
// screen. Usually nobody is asked to type it: it is there so a device that named
// itself after yours can be told from yours. A row the server could not PLACE is
// the exception, and asks for it (see <CheckPrompt>).
//
// THE OUTCOME OF A TAP IS SHOWN ON THE ROW THAT WAS TAPPED - the spinner while
// the grant is in flight, then a tick or the reason it failed - rather than in a
// notice somewhere else on the page. A line that says "Salon is signing in"
// under a list is a second thing to find and read; the row is the thing the
// thumb is already on. Either ending can pull the row out from under the reader
// (a granted beacon is spent, and a lapsed one leaves on the next server poll),
// so the tapped row is held here for a few seconds whichever way it went.
//
// It always says something. Rendering nothing while nothing is found reads as a
// broken screen rather than an empty network, so "still looking" and "nothing
// here, and why" are both the kit's <EmptyState> - and the footer that says the
// looking goes on belongs under a list, never under one of those.

import { useHandoffPicker, useNearbyTvs } from '@kroma/core/react';
import { lanBeacon } from '@kroma/lan-beacon';
import { Box, EmptyState, NearbyTvList, Spinner, styles, Txt } from '@kroma/ui/kit';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { CheckPrompt } from '#mobile/components/connect/CheckPrompt';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

// A television answers the server poll in about a second and a link browse
// faster still, but "nothing here" the instant the mode opens is a lie the
// reader acts on. Hold the looking state long enough for one honest answer.
const SETTLE_MS = 4000;

export function NearbyTvs() {
  const t = useT();
  const client = useClient();
  const { devices, connecting, connect } = useNearbyTvs({
    client,
    lan: lanBeacon ?? undefined,
  });
  const [settled, setSettled] = useState(false);

  // A phone answers with more than pixels, and a thumb that has just left the
  // screen feels the ending before it reads it.
  const buzz = useCallback((result: 'granted' | 'refused') => {
    void Haptics.notificationAsync(
      result === 'granted'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
  }, []);

  const { rows, asking, outcomeFor, start, grant, stopAsking } = useHandoffPicker({
    devices,
    connect,
    onSettled: buzz,
  });

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (asking) {
    return (
      <Box style={s.section}>
        <CheckPrompt device={asking} onGrant={grant} onCancel={stopAsking} />
      </Box>
    );
  }

  let body: ReactNode;
  if (rows.length > 0) {
    body = (
      <NearbyTvList
        devices={rows}
        connectingHandle={connecting?.handle}
        outcomeFor={outcomeFor}
        onSelect={start}
        t={t}
      />
    );
  } else if (!settled) {
    body = (
      <EmptyState
        icon="device-tv"
        title={t('handoff.nearbySearching')}
        action={<Spinner size={18} thickness={2} />}
        compact
      />
    );
  } else {
    body = (
      <EmptyState
        icon="device-tv"
        title={t('handoff.nearbyEmpty')}
        hint={t('handoff.nearbyEmptyHint')}
        compact
      />
    );
  }

  return (
    <Box style={s.section}>
      {body}
      {rows.length > 0 ? (
        <Box style={s.searching}>
          <Spinner size={14} thickness={2} />
          <Txt style={s.searchingLabel}>{t('handoff.nearbySearching')}</Txt>
        </Box>
      ) : null}
    </Box>
  );
}

const s = styles({
  section: { flex: true, w: '100%', gap: spacing.sm },
  searching: { row: true, center: true, gap: spacing.sm, py: spacing.md },
  searchingLabel: { ...type.caption, color: 'textDim' },
});
