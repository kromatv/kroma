import buildInfo from 'virtual:build-info';
import { type Health, LOCALES } from '@kroma/core';
import { useLocale, useSetLocale, useT } from '@kroma/ui';
import { Box, Divider, IconButton, Row, Select, StatusDot, styles, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { serverQueries } from '#web/shared/lib/queries';
import { MODAL_SCRIM } from '#web/shared/ui';
import { CapabilityChip } from '#web/shared/ui/capability-chip';

// The three web-only frames of this sheet: a safe-area inset, a fixed overlay
// and a scroll container, none of which the kit's vocabulary can spell.
const GEAR: CSSProperties = {
  position: 'absolute',
  right: 16,
  top: 'max(1rem, env(safe-area-inset-top))',
  zIndex: 20,
};

const LAYER: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 61,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  pointerEvents: 'none',
};

const BODY: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  padding: '16px 24px',
};

const s = styles({
  panel: { pointerEvents: 'auto' },
  value: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});

function SectionHead({ title, children }: Readonly<{ title: string; children?: ReactNode }>) {
  return (
    <Row gap={8} pt={12} pb={4}>
      <Text variant="overline" color="text/40">
        {title}
      </Text>
      {children}
    </Row>
  );
}

function InfoRow({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <Row between gap={16} py={8}>
      <Text variant="meta" color="textMuted" shrink={0}>
        {label}
      </Text>
      <Text variant="meta" lines={1} minW={0} shrink={1} textAlign="right" style={s.value}>
        {value}
      </Text>
    </Row>
  );
}

/** The gate's corner gear: UI language (this device, applies immediately) and
 * a fuller report than the app sidebar's one-liner: client version, commit,
 * branch and build time, the server's identity, version and content counts,
 * and this device's playback capabilities, for checking a deployment before
 * anyone can sign in. */
export function LoginSettings() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { data: health } = useQuery({ ...serverQueries.health(), enabled: open });

  const builtMs = Date.parse(buildInfo.buildDate);
  const builtAt = Number.isNaN(builtMs)
    ? buildInfo.buildDate
    : new Date(builtMs).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const contentLine = (h: Health) =>
    [
      t('admin.libraryCount', { count: h.libraries }),
      t('settings.mediaCount', { count: h.items }),
      t('browse.count.series', { count: h.shows }),
    ].join(' · ');

  return (
    <>
      <div style={GEAR}>
        <IconButton
          icon="settings"
          variant="ghost"
          diameter={40}
          label={t('nav.settings')}
          onPress={() => setOpen(true)}
        />
      </div>
      {open ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
            className={MODAL_SCRIM}
          />
          <div style={LAYER}>
            <Box
              role="region"
              w="100%"
              maxW={448}
              maxH="88%"
              overflow="hidden"
              radius="xl"
              border="white/10"
              bg="bg"
              shadow="pop"
              style={s.panel}
            >
              <Row between gap={16} px={24} py={16}>
                <Text variant="title">{t('nav.settings')}</Text>
                <IconButton
                  control="sm"
                  icon="x"
                  label={t('common.close')}
                  onPress={() => setOpen(false)}
                />
              </Row>
              <Divider />
              <div style={BODY}>
                <Row between gap={16} py={8}>
                  <Text variant="meta" color="textMuted">
                    {t('account.uiLanguage')}
                  </Text>
                  <Select.Root
                    label={t('account.uiLanguage')}
                    value={locale}
                    onValueChange={(v) => setLocale(v as (typeof LOCALES)[number]['code'])}
                  >
                    <Select.Trigger size="sm" />
                    {LOCALES.map((l) => (
                      <Select.Item key={l.code} value={l.code} label={t(l.labelKey)} />
                    ))}
                  </Select.Root>
                </Row>

                <Divider spacing={6} />
                <SectionHead title={t('nav.versionClient')} />
                <InfoRow label={t('settings.version')} value={`v${buildInfo.version}`} />
                <InfoRow
                  label={t('settings.commit')}
                  value={
                    <Text variant="meta" font="mono">
                      {buildInfo.commit}
                      {buildInfo.dirty ? '-dirty' : ''} · {buildInfo.branch}
                    </Text>
                  }
                />
                <InfoRow label={t('settings.builtAt')} value={builtAt} />

                <Divider spacing={6} />
                <SectionHead title={t('nav.versionServer')}>
                  {health ? (
                    <Row minW={0} gap={6}>
                      <StatusDot online={health.status === 'ok'} size={6} />
                      <Text variant="meta" color="text/70" lines={1}>
                        {health.name}
                      </Text>
                    </Row>
                  ) : null}
                </SectionHead>
                <InfoRow
                  label={t('settings.version')}
                  value={health ? `v${health.version}` : '…'}
                />
                <InfoRow label={t('settings.content')} value={health ? contentLine(health) : '…'} />

                <Divider spacing={6} />
                <Row between gap={16} py={8}>
                  <Text variant="meta" color="textMuted">
                    {t('nav.thisDevice')}
                  </Text>
                  <CapabilityChip />
                </Row>
              </div>
            </Box>
          </div>
        </>
      ) : null}
    </>
  );
}
