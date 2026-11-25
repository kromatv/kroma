import { matchingPackages, type ShippedPackage } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { ListRow, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { LicenseRow } from '#web/features/about/license-row.component';
import { SearchField } from '#web/shared/ui/search-field.component';
import { SettingCard } from '#web/shared/ui/setting-card.component';
import { useShippedPackages } from '#web/features/about/use-shipped-packages.hook';

const SHOWN_AT_FIRST = 50;

interface PackageListProps {
  matches: readonly ShippedPackage[];
  pending: boolean;
}

function PackageList({ matches, pending }: Readonly<PackageListProps>) {
  const t = useT();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  if (pending || matches.length === 0) {
    return (
      <Text variant="meta" color="textMuted">
        {t(pending ? 'common.loading' : 'licenses.none')}
      </Text>
    );
  }

  const shown = all ? matches : matches.slice(0, SHOWN_AT_FIRST);
  return (
    <ListRow.Group size="sm">
      {shown.map((pkg) => (
        <LicenseRow
          key={pkg.key}
          pkg={pkg}
          open={open === pkg.key}
          onToggle={() => setOpen(open === pkg.key ? null : pkg.key)}
        />
      ))}
      {matches.length > shown.length ? (
        <ListRow.Root onPress={() => setAll(true)} chevron={false}>
          <ListRow.Label>{t('licenses.showAll', { count: matches.length })}</ListRow.Label>
        </ListRow.Root>
      ) : null}
    </ListRow.Group>
  );
}

function Tally({ query, shown, total }: Readonly<{ query: string; shown: number; total: number }>) {
  const t = useT();
  return (
    <Text variant="meta" color="textMuted">
      {query.trim() === ''
        ? t('licenses.count', { count: total })
        : t('licenses.matches', { shown, count: total })}
    </Text>
  );
}

/** Every third-party package the server and this app ship, searchable, each
 * opening onto its license texts. */
export function LicensesCard() {
  const t = useT();
  const { packages, pending, serverFailed } = useShippedPackages();
  const [query, setQuery] = useState('');
  const matches = matchingPackages(packages, query);

  return (
    <SettingCard
      icon="license"
      title={t('licenses.title')}
      description={t('licenses.body')}
      aside={
        pending ? null : <Tally query={query} shown={matches.length} total={packages.length} />
      }
    >
      <SearchField label={t('licenses.search')} value={query} onValueChange={setQuery} />
      {serverFailed ? (
        <Text variant="meta" color="danger">
          {t('licenses.failed')}
        </Text>
      ) : null}
      <PackageList matches={matches} pending={pending} />
    </SettingCard>
  );
}
