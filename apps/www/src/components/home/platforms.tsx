import { site } from '@kroma/site-meta';
import {
  IconBox,
  IconBrandAndroid,
  IconBrandApple,
  IconCast,
  IconCpu,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTv,
  IconServer,
  IconWorldWww,
  type TablerIcon,
} from '@tabler/icons-react';
import { Button } from '#site/components/button';
import { Section } from '#site/components/section';
import { m } from '#site/paraglide/messages';

interface Platform {
  id: string;
  Icon: TablerIcon;
  name: () => string;
  detail: () => string;
}

interface Group {
  id: string;
  label: () => string;
  items: readonly Platform[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'screens',
    label: m.home_platforms_group_screens,
    items: [
      {
        id: 'web',
        Icon: IconWorldWww,
        name: m.home_platforms_web_name,
        detail: m.home_platforms_web_detail,
      },
      {
        id: 'mobile',
        Icon: IconDeviceMobile,
        name: m.home_platforms_mobile_name,
        detail: m.home_platforms_mobile_detail,
      },
      {
        id: 'desktop',
        Icon: IconDeviceDesktop,
        name: m.home_platforms_desktop_name,
        detail: m.home_platforms_desktop_detail,
      },
    ],
  },
  {
    id: 'televisions',
    label: m.home_platforms_group_televisions,
    items: [
      {
        id: 'samsung',
        Icon: IconDeviceTv,
        name: m.home_platforms_samsung_name,
        detail: m.home_platforms_samsung_detail,
      },
      {
        id: 'lg',
        Icon: IconDeviceTv,
        name: m.home_platforms_lg_name,
        detail: m.home_platforms_lg_detail,
      },
      {
        id: 'androidTv',
        Icon: IconBrandAndroid,
        name: m.home_platforms_android_tv_name,
        detail: m.home_platforms_android_tv_detail,
      },
      {
        id: 'appleTv',
        Icon: IconBrandApple,
        name: m.home_platforms_apple_tv_name,
        detail: m.home_platforms_apple_tv_detail,
      },
      {
        id: 'cast',
        Icon: IconCast,
        name: m.home_platforms_cast_name,
        detail: m.home_platforms_cast_detail,
      },
    ],
  },
  {
    id: 'server',
    label: m.home_platforms_group_server,
    items: [
      {
        id: 'synology',
        Icon: IconServer,
        name: m.home_platforms_synology_name,
        detail: m.home_platforms_synology_detail,
      },
      {
        id: 'docker',
        Icon: IconBox,
        name: m.home_platforms_docker_name,
        detail: m.home_platforms_docker_detail,
      },
      {
        id: 'raspberryPi',
        Icon: IconCpu,
        name: m.home_platforms_raspberry_pi_name,
        detail: m.home_platforms_raspberry_pi_detail,
      },
    ],
  },
];

export function Platforms() {
  return (
    <Section
      id="plateformes"
      eyebrow={m.home_platforms_eyebrow()}
      title={m.home_platforms_title()}
      intro={m.home_platforms_intro()}
    >
      <div className="flex flex-col gap-10">
        {GROUPS.map((group) => (
          <div key={group.id} className="grid gap-4 lg:grid-cols-[9rem_1fr] lg:gap-8">
            <p className="pt-1 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-dim">
              {group.label()}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(({ id, Icon, name, detail }) => (
                <div
                  key={id}
                  className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-1/40 px-4 py-3.5 transition-colors duration-200 hover:border-border-strong hover:bg-surface-1"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Icon size={19} stroke={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[0.95rem] font-semibold leading-tight text-text">
                      {name()}
                    </p>
                    <p className="truncate font-mono text-[0.7rem] text-dim">{detail()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
        <Button to="/download">{m.home_platforms_install()}</Button>
        <Button href={site.tvUrl} variant="outline">
          {m.home_platforms_tv_demo()}
        </Button>
      </div>
    </Section>
  );
}
