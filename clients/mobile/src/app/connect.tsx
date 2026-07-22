// Add a server by address. Discovery lives on the sign-in server picker
// (continuous LAN sweep); this screen is only the manual path: one field,
// one button. A bare host tries https then http (session.connect).

import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  BackLink,
  OnboardingBox,
  OnboardingScreen,
  OnboardingTitle,
} from '#mobile/components/OnboardingScreen';
import { Button, ErrorBanner, TextField } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useSession } from '#mobile/lib/session';

export default function Connect() {
  const t = useT();
  const router = useRouter();
  const { connect } = useSession();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const raw = url.trim();
    if (!raw || busy) return;
    setBusy(true);
    setError(null);
    try {
      await connect(raw);
      router.replace('/sign-in?phase=form');
    } catch {
      setError(t('connect.serverNotFound'));
      setBusy(false);
    }
  };

  return (
    <OnboardingScreen>
      <OnboardingBox>
        <OnboardingTitle title={t('connect.addServerTitle')} />
        <TextField
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            if (error) setError(null);
          }}
          placeholder={t('connect.serverPlaceholder')}
          keyboardType="url"
          textContentType="URL"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <ErrorBanner message={error} />
        <Button
          label={busy ? t('connect.connectingServer') : t('connect.connect')}
          onPress={() => void submit()}
          loading={busy}
          disabled={!url.trim()}
        />
        {router.canGoBack() ? <BackLink onPress={() => router.back()} /> : null}
      </OnboardingBox>
    </OnboardingScreen>
  );
}
