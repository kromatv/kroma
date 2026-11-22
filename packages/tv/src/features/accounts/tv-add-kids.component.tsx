import { apiErrorText } from '@kromatv/client';
import { countryName, KIDS_LEVELS, type KidsForm, kidsDraft } from '@kromatv/core';
import { type KidsCountry, useCreateKids, useKidsCountry } from '@kromatv/core/react';
import { useLocale, useT } from '@kromatv/ui';
import {
  Box,
  Button,
  CountryChoice,
  Field,
  type FocusHandle,
  Icon,
  ListRow,
  Text,
  useFocusNav,
} from '@kromatv/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useEnv } from '#tv/app/providers/env';
import { useClient } from '#tv/app/router';
import { AuthScreen, UrlKeyboard } from '#tv/shared/ui';
import { PinPanel } from './settings/pin-panel.component';

type Step = 'form' | 'name' | 'country' | 'pin';

type KidsLevel = NonNullable<KidsForm['level']>;

/**
 * A Kids profile made from the picker (route `addKids`), by the admin the
 * picker signed in (ACCT-135): a name typed on its own step, one of the kids
 * levels, the admin's ratings country unless another is picked on its own
 * step (ACCT-155), every library. An admin with no PIN is then offered one
 * (ACCT-133). Leaving returns to the picker, where the new profile waits.
 */
export function TvAddKids() {
  const { user, switchProfile } = useAuth();
  const client = useClient();
  const country = useKidsCountry(() => client.accounts.ratings.get());
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<KidsForm>({ name: '', level: null });
  const toForm = () => setStep('form');
  useStepBack(step, { toForm, leave: switchProfile });

  if (step === 'name') {
    const onName = (name: string) => setForm({ ...form, name });
    return <KidsName name={form.name} onName={onName} onDone={toForm} />;
  }
  if (step === 'country') {
    return <KidsCountryStep country={country} onDone={toForm} />;
  }
  if (step === 'pin') {
    return <KidsPinOffer onDone={switchProfile} />;
  }
  return (
    <KidsFormStep
      form={{ ...form, country: country.country }}
      onForm={setForm}
      go={{ toName: () => setStep('name'), toCountry: () => setStep('country') }}
      onCreated={() => (user?.hasPin ? switchProfile() : setStep('pin'))}
    />
  );
}

function useStepBack(step: Step, go: Readonly<{ toForm: () => void; leave: () => void }>) {
  const held = useRef({ step, go });
  useEffect(() => {
    held.current = { step, go };
  });
  const onBack = useCallback(() => {
    const { step: at, go: to } = held.current;
    if (at === 'name' || at === 'country') {
      to.toForm();
    } else {
      to.leave();
    }
  }, []);
  useFocusNav({ onBack, resetKey: step });
}

function KidsName({
  name,
  onName,
  onDone,
}: Readonly<{ name: string; onName: (name: string) => void; onDone: () => void }>) {
  const t = useT();
  const { physicalKeyboard } = useEnv();
  return (
    <AuthScreen>
      <Box w="100%" maxW={720} gap={20}>
        <Text variant="headingTv">{t('admin.name')}</Text>
        <Field.Root label={t('admin.name')} hideLabel value={name} onValueChange={onName}>
          <Field.Input icon="user" physicalKeyboard={physicalKeyboard} onSubmit={onDone} />
        </Field.Root>
        <UrlKeyboard
          value={name}
          onValueChange={onName}
          onSubmit={onDone}
          submitLabel={t('common.done')}
        />
      </Box>
    </AuthScreen>
  );
}

function KidsFormStep({
  form,
  onForm,
  go,
  onCreated,
}: Readonly<{
  form: KidsForm;
  onForm: (form: KidsForm) => void;
  go: { toName: () => void; toCountry: () => void };
  onCreated: () => void;
}>) {
  const t = useT();
  return (
    <AuthScreen>
      <Box w="100%" maxW={720} gap={24}>
        <StepTitle title={t('admin.addKids')} lead={t('admin.kidsIntro')} />
        <ListRow.Root icon="user" autoFocus onPress={go.toName}>
          <ListRow.Label>{t('admin.name')}</ListRow.Label>
          <ListRow.Hint>{form.name.trim() || t('admin.kidsNameEmpty')}</ListRow.Hint>
        </ListRow.Root>
        <KidsLevelRows level={form.level} onLevel={(level) => onForm({ ...form, level })} />
        <KidsCountryRow country={form.country ?? null} onPress={go.toCountry} />
        <CreateKids form={form} onCreated={onCreated} />
      </Box>
    </AuthScreen>
  );
}

function KidsLevelRows({
  level,
  onLevel,
}: Readonly<{ level: KidsForm['level']; onLevel: (level: KidsLevel) => void }>) {
  const t = useT();
  return (
    <Box gap={10}>
      <Text variant="overlineTv" color="text/45">
        {t('admin.maturity')}
      </Text>
      {KIDS_LEVELS.map((candidate) => (
        <ListRow.Root
          key={candidate}
          chevron={false}
          selected={candidate === level}
          onPress={() => onLevel(candidate)}
        >
          <ListRow.Label>{t(`content.maturity${candidate}`)}</ListRow.Label>
          <ListRow.Hint>{t(`admin.kidsBand${candidate}`)}</ListRow.Hint>
          <ListRow.Trailing>
            {candidate === level ? <Icon name="check" size={22} color="accentText" /> : null}
          </ListRow.Trailing>
        </ListRow.Root>
      ))}
    </Box>
  );
}

function KidsCountryRow({
  country,
  onPress,
}: Readonly<{ country: string | null; onPress: () => void }>) {
  const t = useT();
  const locale = useLocale();
  if (country === null) {
    return null;
  }
  return (
    <ListRow.Root icon="world" onPress={onPress}>
      <ListRow.Label>{t('admin.kidsCountry')}</ListRow.Label>
      <ListRow.Hint>{countryName(country, locale)}</ListRow.Hint>
    </ListRow.Root>
  );
}

function KidsCountryStep({
  country,
  onDone,
}: Readonly<{ country: KidsCountry; onDone: () => void }>) {
  const t = useT();
  const pick = (picked: string) => {
    country.pick(picked);
    onDone();
  };
  return (
    <AuthScreen>
      <Box w="100%" maxW={720} gap={24}>
        <StepTitle title={t('admin.kidsCountry')} lead={t('admin.kidsCountryHint')} />
        <CountryChoice
          label={t('admin.kidsCountry')}
          countries={country.countries}
          value={country.country}
          onValueChange={pick}
        />
      </Box>
    </AuthScreen>
  );
}

function CreateKids({ form, onCreated }: Readonly<{ form: KidsForm; onCreated: () => void }>) {
  const t = useT();
  const client = useClient();
  const { busy, error, create } = useCreateKids({
    createKids: (draft) => client.admin.createKids(draft),
    refusal: (refused) => apiErrorText(refused, t('admin.kidsFailed')),
    onCreated,
  });
  return (
    <>
      {error ? (
        <Text variant="labelTv" color="danger">
          {error}
        </Text>
      ) : null}
      <Button
        size="lg"
        block
        icon="plus"
        disabled={kidsDraft(form) === null || busy}
        label={t('admin.addKidsConfirm')}
        onPress={() => void create(form)}
      />
    </>
  );
}

function StepTitle({ title, lead }: Readonly<{ title: string; lead: string }>) {
  return (
    <Box gap={6}>
      <Text variant="headingTv">{title}</Text>
      <Text variant="bodyTv" color="textDim">
        {lead}
      </Text>
    </Box>
  );
}

function KidsPinOffer({ onDone }: Readonly<{ onDone: () => void }>) {
  const t = useT();
  const entry = useRef<FocusHandle | null>(null);
  return (
    <AuthScreen>
      <Box w="100%" maxW={720} gap={20}>
        <StepTitle title={t('admin.kidsPinOfferTitle')} lead={t('admin.kidsPinOfferBody')} />
        <PinPanel entry={entry} />
        <Button variant="ghost" label={t('common.done')} onPress={onDone} />
      </Box>
    </AuthScreen>
  );
}
