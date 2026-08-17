import { commitLabel, formatBuildDate, repoLabel, type Translate } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, Hint, ListRow, styles, Text, useFocusNav } from '@kroma/ui/kit';
import { Platform } from 'react-native';
import { buildInfo } from '#tv/app/clientBuild';
import { type ClientHardware, clientHardware } from '#tv/app/clientHardware';
import { useEnv } from '#tv/app/providers/env';
import { useNav } from '#tv/app/router';
import { AuthScreen, GATE_MARK, KromaMark } from '#tv/shared/ui';

/**
 * About (route `about`): which build of the client is running.
 *
 * The fact rows are disabled, taking them out of the focus graph: a remote
 * that walks through five dead rows to reach the only live one is worse than
 * one that lands on it directly. Back stays the sole focus target.
 */
export function TvAbout() {
  const nav = useNav();
  const t = useT();
  const locale = useLocale();
  const build = buildInfo();
  const env = useEnv();
  const hardware = clientHardware();
  useFocusNav({ onBack: nav.back });

  return (
    <AuthScreen>
      <Box mb={32}>
        <KromaMark size={GATE_MARK} />
      </Box>
      <Text variant="titleTv" mb={36}>
        {t('about.title')}
      </Text>

      <Box w="100%" maxW={560} gap={12}>
        <Fact label={t('about.platform')} value={platformLabel(env.platform)} />
        <Fact label={t('about.version')} value={`v${build.version}`} />
        <Fact
          label={t('about.cpu')}
          value={
            hardware.cpuCores === null ? null : t('about.cpuCores', { count: hardware.cpuCores })
          }
        />
        <Fact label={t('about.memory')} value={memoryLabel(hardware, t, locale)} />
        {/* A build outside a git checkout has no commit to name; Fact hides
            the row rather than show an empty value. */}
        <Fact label={t('about.commit')} value={commitLabel(build.commit, build.dirty)} mono />
        <Fact label={t('about.branch')} value={build.branch} mono />
        <Fact label={t('about.buildDate')} value={formatBuildDate(build.buildDate, locale)} />
        <Fact label={t('about.repository')} value={repoLabel(build.repository)} />
        {/* Both TV stores require the privacy policy readable in-app, not only
            on the listing: a television can't open a browser to go read it. */}
        <Box mt={20}>
          <Text variant="label" color="textMuted" mb={6}>
            {t('about.privacyTitle')}
          </Text>
          <Text color="textMuted">{t('about.privacyBody')}</Text>
          <Text color="textDim" mt={6}>
            {t('about.privacyUrl')}
          </Text>
        </Box>
        <ListRow.Root icon="arrow-left" autoFocus onPress={nav.back}>
          <ListRow.Label>{t('common.back')}</ListRow.Label>
        </ListRow.Root>
      </Box>

      <Hint
        text={t('profileMenu.navHint')}
        size={14}
        gap={4}
        mt={28}
        color="text/40"
        textStyle={{ fontWeight: '500' }}
      />
    </AuthScreen>
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
  if (!value) return null;
  return (
    <ListRow.Root disabled>
      <ListRow.Label>{label}</ListRow.Label>
      <ListRow.Trailing>
        <Text variant="labelTv" color="textDim" style={mono ? s.mono : undefined}>
          {value}
        </Text>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

const s = styles({
  // Native takes one font family name (a CSS-style list resolves to nothing
  // and silently falls back); the browser shells take the list.
  mono: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: "ui-monospace, 'SF Mono', Menlo, monospace",
    }),
  },
});
