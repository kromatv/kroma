import type { InboundVia } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Badge } from '@kromatv/ui/kit';

const FACE: Record<InboundVia, { tone: 'neutral' | 'info' | 'warning'; labelKey: MessageKey }> = {
  lan: { tone: 'neutral', labelKey: 'network.viaLan' },
  vpn: { tone: 'info', labelKey: 'network.viaVpn' },
  tunnel: { tone: 'info', labelKey: 'network.viaTunnel' },
  internet: { tone: 'warning', labelKey: 'network.viaInternet' },
};

export function ViaBadge({ via }: Readonly<{ via: InboundVia }>) {
  const t = useT();
  const face = FACE[via];
  return <Badge tone={face.tone}>{t(face.labelKey)}</Badge>;
}
