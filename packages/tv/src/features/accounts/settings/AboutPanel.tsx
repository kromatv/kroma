import { commitLabel, formatBuildDate, repoLabel } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useLocale, useT } from '@kromatv/ui';
import {
  Dialog,
  type FocusHandle,
  ListRow,
  monoFont,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { type RefObject, useState } from 'react';
import { buildInfo } from '#tv/app/clientBuild';
import { type ClientHardware, clientHardware } from '#tv/app/clientHardware';
import { useAuthMaybe } from '#tv/app/providers/auth';
import { useEnv } from '#tv/app/providers/env';
import { useNav } from '#tv/app/router';
import { useSettingsPopup } from './settingsPopups';

/** About, in the settings' right pane: which build of the client is running. */
export function AboutPanel({ entry }: Readonly<{ entry: RefObject<FocusHandle | null> }>) {
  const nav = useNav();
  const t = useT();
  const locale = useLocale();
  const build = buildInfo();
  const env = useEnv();
  const hardware = clientHardware();
  const signedIn = Boolean(useAuthMaybe()?.user);

  return (
    <>
      <Fact label={t('about.platform')} value={platformLabel(env.platform)} />
      <Fact label={t('about.version')} value={`v${build.version}`} />
      <Fact
        label={t('about.cpu')}
        value={
          hardware.cpuCores === null ? null : t('about.cpuCores', { count: hardware.cpuCores })
        }
      />
      <Fact label={t('about.memory')} value={memoryLabel(hardware, t, locale)} />
      <Fact label={t('about.commit')} value={commitLabel(build.commit, build.dirty)} mono />
      <Fact label={t('about.branch')} value={build.branch} mono />
      <Fact label={t('about.buildDate')} value={formatBuildDate(build.buildDate, locale)} />
      <Fact label={t('about.repository')} value={repoLabel(build.repository)} />
      {signedIn ? (
        <ListRow.Root
          ground="surface"
          icon="sparkles"
          focusHandle={entry}
          onPress={() => nav.go('releases')}
        >
          <ListRow.Label>{t('releases.title')}</ListRow.Label>
        </ListRow.Root>
      ) : null}
      <PrivacyRow handle={signedIn ? undefined : entry} />
    </>
  );
}

// One binary per native platform, so its label is the OS with no space
// ('AppleTV' / 'AndroidTV' - see the shell's App.tsx); the web shells already
// pass a display-ready string ('Desktop', 'webOS', 'Tizen'), so those pass
// through untouched.
const PLATFORM_LABELS: Record<string, string> = {
  AppleTV: 'Apple TV',
  AndroidTV: 'Android TV',
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

// Free RAM is the number that explains a struggling television, but only a
// native shell can read it (no Web API reports it), so the browser shells fall
// back to the total alone.
function memoryLabel(hardware: ClientHardware, t: Translate, locale: string): string | null {
  const { memoryGb, memoryFreeGb } = hardware;
  if (memoryGb === null) return null;
  const total = gb(memoryGb, locale);
  if (memoryFreeGb === null) return t('about.memorySize', { gb: total });
  return t('about.memoryFree', { free: gb(memoryFreeGb, locale), total });
}

function gb(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

function Fact({
  label,
  value,
  mono,
}: Readonly<{ label: string; value: string | null; mono?: boolean }>) {
  const s = useStyles(sDefinition);

  if (!value) return null;
  return (
    <ListRow.Root ground="surface" disabled>
      <ListRow.Label>{label}</ListRow.Label>
      <ListRow.Trailing>
        <Text variant="labelTv" color="textDim" style={mono ? s.mono : undefined}>
          {value}
        </Text>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function PrivacyRow({ handle }: Readonly<{ handle?: RefObject<FocusHandle | null> }>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useSettingsPopup(open);
  return (
    <>
      <ListRow.Root
        ground="surface"
        icon="shield-lock"
        focusHandle={handle}
        onPress={() => setOpen(true)}
      >
        <ListRow.Label>{t('about.privacyTitle')}</ListRow.Label>
      </ListRow.Root>
      <Dialog.Root
        open={open}
        onClose={() => setOpen(false)}
        title={t('about.privacyTitle')}
        width="lg"
      >
        <Text color="textMuted">{t('about.privacyBody')}</Text>
        <Text color="textDim" mt={12}>
          {t('about.privacyUrl')}
        </Text>
      </Dialog.Root>
    </>
  );
}

const sDefinition = styles({
  mono: { fontFamily: monoFont() },
});
