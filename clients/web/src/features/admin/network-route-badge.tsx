import type { FlowRoute } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Badge } from '@kromatv/ui/kit';

const FACE: Record<FlowRoute, { tone: 'neutral' | 'info' | 'danger'; labelKey: MessageKey }> = {
  direct: { tone: 'neutral', labelKey: 'network.routeDirect' },
  vpn: { tone: 'info', labelKey: 'network.routeVpn' },
  blocked: { tone: 'danger', labelKey: 'network.routeBlocked' },
};

export function RouteBadge({ route }: Readonly<{ route: FlowRoute }>) {
  const t = useT();
  const face = FACE[route];
  return <Badge tone={face.tone}>{t(face.labelKey)}</Badge>;
}
