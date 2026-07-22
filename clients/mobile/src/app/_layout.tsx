import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DownloadsProvider } from '#mobile/lib/downloads';
import { I18nProvider } from '#mobile/lib/i18n';
import { SessionProvider, useSession } from '#mobile/lib/session';
import { colors } from '#mobile/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 30 * 60_000, retry: 1 },
    },
  });
}

function Shell() {
  const { status, user, client } = useSession();
  // One cache per signed-in account: switching users drops everything.
  const [clients] = useState(() => new Map<string, QueryClient>());
  const cacheKey = user?.id ?? 'anon';
  let queryClient = clients.get(cacheKey);
  if (!queryClient) {
    queryClient = makeQueryClient();
    clients.clear();
    clients.set(cacheKey, queryClient);
  }

  useEffect(() => {
    if (status !== 'booting') SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <DownloadsProvider client={client}>
          <BottomSheetModalProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            />
          </BottomSheetModalProvider>
        </DownloadsProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionProvider>
        <StatusBar style="light" />
        <Shell />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
