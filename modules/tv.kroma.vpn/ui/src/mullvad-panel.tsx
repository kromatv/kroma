import { KromaApiError } from '@kromatv/client';
import { apiErrorText, usePoll, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Field, Row, Select, Switch, Text } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { useVpnApi } from './api';
import {
  type MullvadCountry,
  type MullvadRefusal,
  MullvadRefusal as Refusal,
  type VpnProvider,
} from './schemas';

const PLACES_POLL_MS = 60 * 60 * 1000;
const ANY_CITY = '';

type Held = Extract<VpnProvider, { kind: 'mullvad' }>;

function placesFor(countries: readonly MullvadCountry[], ownedOnly: boolean): MullvadCountry[] {
  if (!ownedOnly) return [...countries];
  return countries
    .filter((country) => country.owned)
    .map((country) => ({ ...country, cities: country.cities.filter((city) => city.owned) }));
}

/** Connect through Mullvad: the account number once, then a country and an
 * optional city. `held` is the Mullvad place this server already uses, if any. */
export function MullvadPanel({
  held,
  onConnected,
}: Readonly<{ held: Held | null; onConnected: () => void }>) {
  const t = useT();
  const vpn = useVpnApi();
  const { data, failed } = usePoll(
    ['admin', 'vpn', 'mullvad', 'locations'],
    () => vpn.mullvadLocations(),
    PLACES_POLL_MS,
  );
  const [account, setAccount] = useState('');
  const [newAccount, setNewAccount] = useState(held === null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [country, setCountry] = useState(held?.country ?? '');
  const [city, setCity] = useState(held?.city ?? ANY_CITY);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<MullvadRefusal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(() => placesFor(data?.countries ?? [], ownedOnly), [data, ownedOnly]);
  const cities = countries.find((one) => one.code === country)?.cities ?? [];
  const digits = account.replace(/\D/g, '');
  const ready = country !== '' && (!newAccount || digits.length >= 16) && !busy;

  const connect = async () => {
    setBusy(true);
    setRefusal(null);
    setError(null);
    try {
      await vpn.mullvadConnect({
        accountNumber: newAccount ? digits : null,
        country,
        city: city === ANY_CITY ? null : city,
        ownedOnly,
      });
      onConnected();
    } catch (cause: unknown) {
      const parsed = cause instanceof KromaApiError ? Refusal.safeParse(cause.body) : null;
      if (parsed?.success) setRefusal(parsed.data);
      else setError(apiErrorText(cause, t('vpn.mullvadUnavailable')));
    } finally {
      setBusy(false);
    }
  };

  const freeSlot = async (deviceId: string) => {
    setBusy(true);
    try {
      await vpn.mullvadRemoveDevice(digits, deviceId);
    } catch (cause) {
      setError(apiErrorText(cause, t('vpn.mullvadUnavailable')));
      setBusy(false);
      return;
    }
    await connect();
  };

  return (
    <Box gap={16}>
      <Text variant="meta" color="textDim">
        {t('vpn.mullvadIntro')}
      </Text>
      {newAccount ? (
        <Field.Root label={t('vpn.mullvadAccount')} value={account} onValueChange={setAccount}>
          <Field.Input type="password" autoComplete="off" placeholder="1234 5678 9012 3456" />
          <Field.Hint>{t('vpn.mullvadAccountHint')}</Field.Hint>
        </Field.Root>
      ) : (
        <Row between align="center" gap={12}>
          <Text variant="meta" color="textMuted">
            {t('vpn.mullvadDevice', { name: held?.deviceName ?? '' })}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            label={t('vpn.mullvadOtherAccount')}
            onPress={() => setNewAccount(true)}
          />
        </Row>
      )}
      <Row between align="center" gap={12}>
        <Box shrink={1} minW={0}>
          <Text variant="label">{t('vpn.mullvadOwnedOnly')}</Text>
          <Text variant="meta" color="textDim">
            {t('vpn.mullvadOwnedOnlyHint')}
          </Text>
        </Box>
        <Switch
          checked={ownedOnly}
          onCheckedChange={setOwnedOnly}
          label={t('vpn.mullvadOwnedOnly')}
        />
      </Row>
      {failed ? (
        <Text variant="meta" color="dangerHover">
          {t('vpn.mullvadPlacesFailed')}
        </Text>
      ) : null}
      <Row wrap gap={12}>
        <Box flex minW={180}>
          <Select.Root
            value={country}
            onValueChange={(next) => {
              setCountry(next);
              setCity(ANY_CITY);
            }}
            label={t('vpn.mullvadCountry')}
            placeholder={data ? t('vpn.mullvadCountry') : t('vpn.mullvadLoadingPlaces')}
            disabled={!data}
          >
            <Select.Trigger block />
            {countries.map((one) => (
              <Select.Item key={one.code} value={one.code} label={one.name} />
            ))}
          </Select.Root>
        </Box>
        <Box flex minW={180}>
          <Select.Root
            value={city}
            onValueChange={setCity}
            label={t('vpn.mullvadCity')}
            placeholder={t('vpn.mullvadAnyCity')}
            disabled={cities.length === 0}
          >
            <Select.Trigger block />
            <Select.Item value={ANY_CITY} label={t('vpn.mullvadAnyCity')} />
            {cities.map((one) => (
              <Select.Item key={one.code} value={one.code} label={one.name} />
            ))}
          </Select.Root>
        </Box>
      </Row>
      {refusal ? (
        <RefusalNote refusal={refusal} onFree={(id) => void freeSlot(id)} busy={busy} />
      ) : null}
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
      <Row>
        <Button
          variant="primary"
          label={t(held ? 'vpn.mullvadSwitch' : 'vpn.mullvadConnect')}
          onPress={() => void connect()}
          loading={busy}
          disabled={!ready}
        />
      </Row>
    </Box>
  );
}

const REFUSAL_KEY = {
  accountNeeded: 'vpn.mullvadAccountNeeded',
  invalidAccount: 'vpn.mullvadInvalidAccount',
  maxDevices: 'vpn.mullvadMaxDevices',
  noRelay: 'vpn.mullvadNoRelay',
  throttled: 'vpn.mullvadThrottled',
  unavailable: 'vpn.mullvadUnavailable',
} as const;

function RefusalNote({
  refusal,
  onFree,
  busy,
}: Readonly<{ refusal: MullvadRefusal; onFree: (deviceId: string) => void; busy: boolean }>) {
  const t = useT();
  return (
    <Callout.Root tone="danger">
      <Callout.Title>{t(REFUSAL_KEY[refusal.code])}</Callout.Title>
      {refusal.devices?.map((device) => (
        <Row key={device.id} between align="center" gap={12} mt={8}>
          <Text variant="meta">{device.name}</Text>
          <Button
            variant="dangerGhost"
            size="sm"
            label={t('vpn.mullvadRemoveDevice')}
            onPress={() => onFree(device.id)}
            disabled={busy}
          />
        </Row>
      ))}
    </Callout.Root>
  );
}
