import { Redirect } from 'expo-router';
import { useSession } from '../lib/session';

/** Entry dispatch: booting shows nothing (native splash is still up). */
export default function Index() {
  const { status, serverUrl } = useSession();
  if (status === 'booting') return null;
  if (status === 'signedIn') return <Redirect href="/(app)/(tabs)" />;
  return <Redirect href={serverUrl ? '/sign-in' : '/connect'} />;
}
