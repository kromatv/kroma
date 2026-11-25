import type { BuildInfo } from 'virtual:build-info';
import { useT } from '@kromatv/ui';
import { Button, Logo, PageHeader } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { copyText } from '#web/shared/lib/copy-text';
import { clientStamp, serverStamp, versionReport } from '#web/shared/lib/version-stamp';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { OutsideLink } from '#web/shared/ui/outside-link.component';

const SITE = 'https://kroma.tv';

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

/** The head of the About page: the mark, what KROMA is, where to read more,
 * and the versions to paste into a bug report. */
export function AboutHero({ info }: Readonly<{ info: BuildInfo }>) {
  const t = useT();
  return (
    <PageHeader.Root>
      <Logo size={36} />
      <PageHeader.Subtitle>{t('about.tagline')}</PageHeader.Subtitle>
      <PageHeader.Actions>
        <Button variant="glass" size="sm" icon="world" label="kroma.tv" asChild>
          <OutsideLink to={SITE} />
        </Button>
        {info.repository ? (
          <Button
            variant="glass"
            size="sm"
            icon="brand-github"
            label={t('about.sourceCode')}
            asChild
          >
            <OutsideLink to={info.repository} />
          </Button>
        ) : null}
        <CopyVersions info={info} />
      </PageHeader.Actions>
    </PageHeader.Root>
  );
}
