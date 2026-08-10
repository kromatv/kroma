// The fast half of "connect a device": the TVs waiting on this network, one tap
// each. Everything it decides lives in `useNearbyTvs`; this brings the rows.
//
// A browser cannot listen to its own link, so the server is this shell's only
// source. The phone app passes a second one.
//
// Every row carries the check string that television is printing on its own
// screen. Usually nobody is asked to type it: it is there so a device that named
// itself after yours can be told from yours. A row the server could not PLACE is
// the exception, and asks for it (see <CheckPrompt>).
//
// The outcome of a click is shown on the row that was clicked, the way the phone
// shows it: a spinner, then a tick or the reason it failed. Either ending can
// pull the row out from under the reader (a granted beacon is spent, and a
// lapsed one leaves on the next server poll), so the clicked row is held here
// for a few seconds whichever way it went.
//
// It renders nothing at all when nothing is waiting and nothing was clicked: an
// empty box above the code field would only ask the reader to work out whether
// it is broken.

import type { DiscoveredTv, GrantResult } from '@kroma/core';
import { HANDOFF_CHECK_LENGTH } from '@kroma/core';
import { useCheckPrompt, useHandoffPicker, useNearbyTvs } from '@kroma/core/react';
import { useT } from '@kroma/ui';
import { Button, NearbyTvList, OtpField, REGEXP_ONLY_DIGITS_AND_CHARS, Txt } from '@kroma/ui/kit';
import { useAuth } from '#web/shared/lib/auth';

export function NearbyTvs() {
  const t = useT();
  const { client } = useAuth();
  const { devices, connecting, connect } = useNearbyTvs({ client });
  const { rows, asking, outcomeFor, start, grant, stopAsking } = useHandoffPicker({
    devices,
    connect,
  });

  if (rows.length === 0 && !asking) return null;

  return (
    <section className="mb-8 text-left">
      <h2 className="mb-1 font-display text-[15px] font-bold">{t('handoff.nearbyTitle')}</h2>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">{t('handoff.nearbySub')}</p>

      {asking ? (
        <CheckPrompt device={asking} onGrant={grant} onCancel={stopAsking} />
      ) : (
        <NearbyTvList
          devices={rows}
          connectingHandle={connecting?.handle}
          outcomeFor={outcomeFor}
          onSelect={start}
          t={t}
        />
      )}

      <Txt style={{ fontSize: 12, marginTop: 18, textAlign: 'center' }} color="textDim">
        {t('handoff.otherWays')}
      </Txt>
    </section>
  );
}

// The one television the server could not place, and the code it is printing.
// Replaces the list rather than sitting under it: the reader has picked, and
// what is left to do is read five characters off a screen across the room.
function CheckPrompt({
  device,
  onGrant,
  onCancel,
}: Readonly<{
  device: DiscoveredTv;
  onGrant: (device: DiscoveredTv, check: string) => Promise<GrantResult>;
  onCancel: () => void;
}>) {
  const t = useT();
  const { code, setCode, busy, refused, submit } = useCheckPrompt({ device, onGrant });
  const asked = t('handoff.checkPrompt', { name: device.name });

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface-2 px-4 py-6">
      <p className="text-center font-display text-[15px] font-bold">{asked}</p>
      <OtpField
        maxLength={HANDOFF_CHECK_LENGTH}
        value={code}
        onChange={setCode}
        onComplete={(value) => void submit(value)}
        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
        physicalKeyboard
        autoFocus
        disabled={busy}
        invalid={refused !== null}
        label={asked}
      />
      <p
        className={`text-center text-[13px] ${refused ? 'font-medium text-danger' : 'text-muted'}`}
      >
        {refused ? t(`handoff.${refused}`) : t('handoff.checkHint')}
      </p>
      <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onCancel} />
    </div>
  );
}
