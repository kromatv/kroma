import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { I18nProvider as KitI18nProvider } from '@kroma/ui';
import { setImageBackend } from '@kroma/ui/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DownloadsProvider } from '#mobile/lib/downloads';
import { I18nProvider, useI18n } from '#mobile/lib/i18n';
import { expoImageBackend } from '#mobile/lib/image-backend';
import { isTablet } from '#mobile/lib/layout';
import { SessionProvider, useSession } from '#mobile/lib/session';
import { colors } from '#mobile/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// The design system draws artwork through whichever decoder the app registers.
// A phone wants expo-image's memory + disk cache; see lib/image-backend.
setImageBackend(expoImageBackend);

/** Feed the app's resolved locale into the design system's own i18n context,
 * so kit organisms that translate for themselves (StatsPanel, ...) read the
 * same language as the app. */
function KitI18nBridge({ children }: Readonly<{ children: ReactNode }>) {
  return <KitI18nProvider locale={useI18n().locale}>{children}</KitI18nProvider>;
}

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
        <KitI18nBridge>
          <DownloadsProvider client={client}>
            <BottomSheetModalProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'fade',
                  // Phones are portrait-only outside the player (which sets its
                  // own landscape lock in (app)/_layout); tablets rotate freely.
                  orientation: isTablet ? 'default' : 'portrait',
                }}
              />
            </BottomSheetModalProvider>
          </DownloadsProvider>
        </KitI18nBridge>
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
