import { useFormat, useT } from '@kroma/module-sdk';
import { Callout } from '@kroma/ui/kit';
import type { VpnBandwidthView } from './schemas';
import { bypassedBytes, type SealNote, sealNote } from './seal-note';

export function SealBanner({ view }: Readonly<{ view: VpnBandwidthView }>) {
  const t = useT();
  const fmt = useFormat();
  const note = sealNote(view);
  const bypassed = bypassedBytes(view);
  const sealed = note.kind === 'sealed';
  return (
    <Callout.Root size="sm" tone={toneOf(note)} icon={sealed ? 'shield-check' : 'shield-x'}>
      <Callout.Title>{text(t, fmt, note)}</Callout.Title>
      {bypassed > 0 ? (
        <Callout.Detail>
          {t('vpnBandwidth.bypassed', { total: fmt.bytes(bypassed) })}
        </Callout.Detail>
      ) : null}
    </Callout.Root>
  );
}

function toneOf(note: SealNote) {
  if (note.kind === 'sealed') return 'success';
  return note.kind === 'leaked' ? 'danger' : 'accent';
}

function text(
  t: ReturnType<typeof useT>,
  fmt: ReturnType<typeof useFormat>,
  note: SealNote,
): string {
  switch (note.kind) {
    case 'noBridge':
      return t('vpnBandwidth.noBridge');
    case 'leaked':
      return t('vpnBandwidth.leaked', { total: fmt.bytes(note.bytes) });
    case 'gap':
      return t('vpnBandwidth.gap', { duration: fmt.uptime(note.secs) });
    default:
      return t('vpnBandwidth.sealed');
  }
}
