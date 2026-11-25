import type { BuildInfo } from 'virtual:build-info';
import { useT } from '@kromatv/ui';
import { Box, Button, Logo, Row, Surface, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { copyText } from '#web/shared/lib/copy-text';
import { clientStamp, serverStamp, versionReport } from '#web/shared/lib/version-stamp';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { OutsideLink } from '#web/shared/ui/outside-link.component';
import { RouteLink } from '#web/shared/ui/route-link.component';

const SITE = 'https://kroma.tv';

const sDefinition = styles({
  glow: {
    backgroundImage:
      'radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--kroma-accent) 18%, transparent), transparent 55%), radial-gradient(90% 140% at 100% 100%, color-mix(in srgb, var(--kroma-info) 14%, transparent), transparent 60%)',
  },
});

function CopyVersions({ info }: Readonly<{ info: BuildInfo }>) {
  const t = useT();
  const { queries } = useWebRuntime();
  const { data: health } = useQuery(queries.serverQueries.health());
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const report = versionReport(clientStamp(info), health ? serverStamp(health) : null);
    setCopied(await copyText(report));
  };
  return (
    <Button
      variant="glass"
      size="sm"
      icon={copied ? 'check' : 'copy'}
      label={t(copied ? 'common.copied' : 'about.copyVersions')}
      onPress={() => void copy()}
    />
  );
}

function HeroLinks({ info }: Readonly<{ info: BuildInfo }>) {
  const t = useT();
  return (
    <Row wrap gap={10}>
      <Button size="sm" icon="sparkles" label={t('releases.title')} asChild>
        <RouteLink to="/whats-new" />
      </Button>
      <Button variant="glass" size="sm" icon="world" label="kroma.tv" asChild>
        <OutsideLink to={SITE} />
      </Button>
      {info.repository ? (
        <Button variant="glass" size="sm" icon="brand-github" label={t('about.sourceCode')} asChild>
          <OutsideLink to={info.repository} />
        </Button>
      ) : null}
      <CopyVersions info={info} />
    </Row>
  );
}

/** The head of the About page: the mark, what KROMA is, and where to read
 * more about it. */
export function AboutHero({ info }: Readonly<{ info: BuildInfo }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Box p={{ base: 24, md: 40 }} gap={24} style={s.glow}>
        <Logo size={40} />
        <Box gap={8} maxW={640}>
          <Text variant="heading" accessibilityRole="header">
            {t('about.tagline')}
          </Text>
          <Text color="textMuted">{t('about.motto')}</Text>
        </Box>
        <HeroLinks info={info} />
      </Box>
    </Surface>
  );
}
