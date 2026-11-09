import type { ModulePermissions } from '@kromatv/client/modules';
import type { Translate } from '@kromatv/i18n';
import type { PermissionGroup } from '#web/features/admin/module-permissions';
import { listOf, opening, purposeWord } from '#web/features/admin/module-permissions-words';

type Net = NonNullable<ModulePermissions['net']>;
type Connect = NonNullable<Net['connect']>[number];
type Listen = NonNullable<Net['listen']>[number];

const HOSTS_SHOWN = 3;

const unique = (items: readonly string[]) => [...new Set(items)];
const outward = (to: string) => to !== 'lan';

function destinationWord(to: string, t: Translate): string {
  if (to === 'public') return t('modulePermissions.toAnywhere');
  if (to.startsWith('setting:')) return t('modulePermissions.toSetting');
  return to;
}

function withPorts(where: string | null, ports: readonly number[] | undefined, t: Translate) {
  if (!ports?.length) return where ?? undefined;
  const said = t('modulePermissions.ports', { ports: ports.join(', '), count: ports.length });
  return where
    ? t('modulePermissions.destinationPorts', { to: where, ports: said })
    : opening(said);
}

function purposeDetail(connect: Connect | Listen, hint: string | undefined, t: Translate) {
  return { text: opening(purposeWord(connect.purpose, t)), hint };
}

/** Where on the internet a module connects, and why. */
export function internetGroup(connects: readonly Connect[], t: Translate): PermissionGroup | null {
  const reaching = connects.filter((connect) => connect.to.some(outward));
  const [only] = reaching;
  if (!only) return null;
  const to = reaching.flatMap((connect) => connect.to.filter(outward));
  const anywhere = to.includes('public');
  const where = anywhere
    ? t('modulePermissions.toAnywhere')
    : listOf(unique(to.map((one) => destinationWord(one.replace(/^\*\./, ''), t))), t, HOSTS_SHOWN);
  const opensWithWord = anywhere || to[0]?.startsWith('setting:');
  return {
    category: 'internet',
    summary:
      reaching.length === 1
        ? t('modulePermissions.internetFor', { to: where, why: purposeWord(only.purpose, t) })
        : t('modulePermissions.internetSummary', { to: where }),
    brief: opensWithWord ? opening(where) : where,
    details: reaching.map((connect) => {
      const targets = connect.to.filter(outward);
      const said = listOf(unique(targets.map((one) => destinationWord(one, t))), t);
      const startsWithWord = targets[0] === 'public' || targets[0]?.startsWith('setting:');
      return purposeDetail(
        connect,
        withPorts(startsWithWord ? opening(said) : said, connect.ports, t),
        t,
      );
    }),
    extended: false,
    access: null,
  };
}

const LAN_SAID = {
  talks: ['modulePermissions.lanSummary', 'modulePermissions.lanBrief'],
  announces: ['modulePermissions.lanAnnounce', 'modulePermissions.lanAnnounceBrief'],
  searches: ['modulePermissions.lanSearch', 'modulePermissions.lanSearchBrief'],
} as const;

/** What a module does on the local network: devices it talks to, and the
 *  announcing and searching the host does for it. */
export function lanGroup(net: Net | undefined, t: Translate): PermissionGroup | null {
  const local = (net?.connect ?? []).filter((connect) => connect.to.includes('lan'));
  const discovery = net?.discovery ?? [];
  if (local.length === 0 && discovery.length === 0) return null;
  let said: (typeof LAN_SAID)[keyof typeof LAN_SAID] = LAN_SAID.searches;
  if (local.length > 0) said = LAN_SAID.talks;
  else if (discovery.includes('mdns')) said = LAN_SAID.announces;
  return {
    category: 'lan',
    summary: t(said[0]),
    brief: t(said[1]),
    details: [
      ...local.map((connect) => purposeDetail(connect, withPorts(null, connect.ports, t), t)),
      ...discovery.map((kind) => ({
        text: t(
          kind === 'mdns' ? 'modulePermissions.discoveryMdns' : 'modulePermissions.discoverySsdp',
        ),
      })),
    ],
    extended: false,
    access: null,
  };
}

function listenPorts({ port, count = 1 }: Listen, t: Translate): string | undefined {
  const after = count - 1;
  if (typeof port !== 'number') {
    return after > 0
      ? t('modulePermissions.portSettingRun', { count: after })
      : t('modulePermissions.portSetting');
  }
  if (after === 0) return withPorts(null, [port], t);
  return opening(t('modulePermissions.portRange', { first: port, last: port + after }));
}

/** The incoming connections a program the module starts accepts. */
export function listenGroup(listens: readonly Listen[], t: Translate): PermissionGroup | null {
  const [only] = listens;
  if (!only) return null;
  const one = listens.length === 1;
  return {
    category: 'listen',
    summary: one
      ? t('modulePermissions.listenFor', { why: purposeWord(only.purpose, t) })
      : t('modulePermissions.listenSummary'),
    brief: one
      ? opening(purposeWord(only.purpose, t))
      : t('modulePermissions.listenBrief', { count: listens.length }),
    details: listens.map((listen) => purposeDetail(listen, listenPorts(listen, t), t)),
    extended: false,
    access: null,
  };
}
