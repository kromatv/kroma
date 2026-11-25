import { matchingPackages, type ShippedPackage } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Field, ListRow, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { LicenseRow } from '#web/features/accounts/account/license-row.component';
import { SettingCard } from '#web/features/accounts/account/setting-card.component';
import { useShippedPackages } from '#web/features/accounts/account/use-shipped-packages.hook';

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

function PackageSearch({
  value,
  onValueChange,
}: Readonly<{ value: string; onValueChange: (value: string) => void }>) {
  const t = useT();
  return (
    <Field.Root label={t('licenses.search')} hideLabel>
      <Field.Input
        type="search"
        icon="search"
        placeholder={t('licenses.search')}
        value={value}
        onValueChange={onValueChange}
      />
    </Field.Root>
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
      <PackageSearch value={query} onValueChange={setQuery} />
      {serverFailed ? (
        <Text variant="meta" color="danger">
          {t('licenses.failed')}
        </Text>
      ) : null}
      <PackageList matches={matches} pending={pending} />
    </SettingCard>
  );
}
