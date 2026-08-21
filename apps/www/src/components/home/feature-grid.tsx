import {
  IconChartLine,
  IconDownload,
  IconPlayerPlay,
  IconShieldHalf,
  IconSparkles,
  IconTargetArrow,
  IconUsers,
  IconWorldSearch,
  type TablerIcon,
} from '@tabler/icons-react';
import { Section } from '#site/components/section';
import { m } from '#site/paraglide/messages';

interface Feature {
  id: string;
  Icon: TablerIcon;
  span: string;
  title: () => string;
  body: () => string;
  tag: () => string;
  where: 'core' | 'module';
}

const FEATURES: readonly Feature[] = [
  {
    id: 'acquisition',
    Icon: IconTargetArrow,
    span: 'lg:col-span-3 sm:col-span-2',
    title: m.home_features_acquisition_title,
    body: m.home_features_acquisition_body,
    tag: m.home_features_acquisition_tag,
    where: 'module',
  },
  {
    id: 'vpn',
    Icon: IconShieldHalf,
    span: 'lg:col-span-3 sm:col-span-2',
    title: m.home_features_vpn_title,
    body: m.home_features_vpn_body,
    tag: m.home_features_vpn_tag,
    where: 'module',
  },
  {
    id: 'indexers',
    Icon: IconWorldSearch,
    span: 'lg:col-span-2',
    title: m.home_features_indexers_title,
    body: m.home_features_indexers_body,
    tag: m.home_features_indexers_tag,
    where: 'module',
  },
  {
    id: 'downloader',
    Icon: IconDownload,
    span: 'lg:col-span-2',
    title: m.home_features_downloader_title,
    body: m.home_features_downloader_body,
    tag: m.home_features_downloader_tag,
    where: 'module',
  },
  {
    id: 'player',
    Icon: IconPlayerPlay,
    span: 'lg:col-span-2',
    title: m.home_features_player_title,
    body: m.home_features_player_body,
    tag: m.home_features_player_tag,
    where: 'core',
  },
  {
    id: 'ai',
    Icon: IconSparkles,
    span: 'lg:col-span-2',
    title: m.home_features_ai_title,
    body: m.home_features_ai_body,
    tag: m.home_features_ai_tag,
    where: 'module',
  },
  {
    id: 'users',
    Icon: IconUsers,
    span: 'lg:col-span-2',
    title: m.home_features_users_title,
    body: m.home_features_users_body,
    tag: m.home_features_users_tag,
    where: 'core',
  },
  {
    id: 'stats',
    Icon: IconChartLine,
    span: 'lg:col-span-2',
    title: m.home_features_stats_title,
    body: m.home_features_stats_body,
    tag: m.home_features_stats_tag,
    where: 'core',
  },
];

export function FeatureGrid() {
  return (
    <Section
      id="fonctionnalites"
      eyebrow={m.home_features_eyebrow()}
      title={m.home_features_title()}
      intro={m.home_features_intro()}
    >
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-6">
          {FEATURES.map(({ id, Icon, span, title, body, tag, where }) => (
            <div
              key={id}
              className={`group flex flex-col bg-surface-1/40 p-6 transition-colors duration-200 hover:bg-surface-1 ${span}`}
            >
              <div className="flex items-start justify-between gap-3">
                <Icon
                  size={22}
                  stroke={1.75}
                  aria-hidden
                  className="text-accent-text transition-transform duration-300 ease-out group-hover:-translate-y-0.5"
                />
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] ${
                    where === 'module'
                      ? 'border-accent/30 text-accent-text'
                      : 'border-border-strong text-dim'
                  }`}
                >
                  {where === 'module' ? m.label_module() : m.label_in_server()}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold leading-snug text-text">
                {title()}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{body()}</p>
              <p className="mt-4 font-mono text-[0.72rem] tracking-tight text-dim">{tag()}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
