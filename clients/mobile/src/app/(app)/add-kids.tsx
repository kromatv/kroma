import { apiErrorText } from '@kromatv/client';
import { type KidsForm, kidsDraft } from '@kromatv/core';
import { useCreateKids } from '@kromatv/core/react';
import { Button, Field, KidsLevelChoice, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView } from 'react-native';
import { PageHeader } from '#mobile/components/page-header.component';
import { ErrorBanner, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

/** A Kids profile made from the phone's gate by the admin it signed in
 *  (ACCT-135): a name, one of the kids levels, every library. An admin with no
 *  PIN is then offered one (ACCT-133). Leaving returns to the gate. */
export default function AddKids() {
  const router = useRouter();
  const { user, switchProfile } = useSession();
  const [made, setMade] = useState(false);
  if (made) {
    return (
      <KidsPinOffer onSet={() => router.replace('/(app)/profile-pin')} onSkip={switchProfile} />
    );
  }
  return <KidsFormScreen onCreated={() => (user?.hasPin ? switchProfile() : setMade(true))} />;
}

function KidsFormScreen({ onCreated }: Readonly<{ onCreated: () => void }>) {
  const t = useT();
  const [form, setForm] = useState<KidsForm>({ name: '', level: null });
  const { busy, error, create } = useCreateOnServer(onCreated);
  return (
    <KidsScreen title={t('admin.addKids')} lead={t('admin.kidsIntro')}>
      <Field.Root
        label={t('admin.name')}
        value={form.name}
        onValueChange={(name) => setForm({ ...form, name })}
      >
        <Field.Input icon="user" />
      </Field.Root>
      <KidsLevelChoice value={form.level} onValueChange={(level) => setForm({ ...form, level })} />
      <ErrorBanner message={error} />
      <Button
        label={t('admin.addKidsConfirm')}
        loading={busy}
        disabled={kidsDraft(form) === null}
        onPress={() => void create(form)}
      />
    </KidsScreen>
  );
}

function useCreateOnServer(onCreated: () => void) {
  const t = useT();
  const client = useClient();
  return useCreateKids({
    createKids: (draft) => client.admin.createKids(draft),
    refusal: (refused) => apiErrorText(refused, t('admin.kidsFailed')),
    onCreated,
  });
}

function KidsPinOffer({ onSet, onSkip }: Readonly<{ onSet: () => void; onSkip: () => void }>) {
  const t = useT();
  return (
    <KidsScreen title={t('admin.kidsPinOfferTitle')} lead={t('admin.kidsPinOfferBody')}>
      <Button label={t('admin.kidsPinOfferSet')} onPress={onSet} />
      <Button variant="glass" label={t('admin.kidsPinOfferSkip')} onPress={onSkip} />
    </KidsScreen>
  );
}

function KidsScreen({
  title,
  lead,
  children,
}: Readonly<{ title: string; lead: string; children: ReactNode }>) {
  const s = useStyles(sDefinition);
  return (
    <Screen padded={false}>
      <PageHeader title={title} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>{lead}</Text>
        {children}
      </ScrollView>
    </Screen>
  );
}

const sDefinition = styles({
  body: { gap: spacing.lg, p: spacing.md, ...boxed(contentWidth.form) },
  intro: { ...type.body, color: 'textMuted' },
});
