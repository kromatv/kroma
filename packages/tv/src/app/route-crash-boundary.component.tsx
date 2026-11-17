import type { KromaClient } from '@kromatv/client';
import type { ReactNode } from 'react';
import { CrashBoundary } from '#tv/app/crash-boundary.component';
import { CrashScreen } from '#tv/app/crash-screen.component';
import { useNav } from '#tv/app/router';

function CrashFallback({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const nav = useNav();
  return <CrashScreen onRetry={onRetry} onBack={nav.canGoBack ? nav.back : undefined} />;
}

const crashFallback = (retry: () => void) => <CrashFallback onRetry={retry} />;

interface RouteCrashBoundaryProps {
  client: KromaClient | null;
  platform: string;
  children: ReactNode;
}

/** The app's crash boundary, mounted inside the router: its screen offers Back,
 * and leaving the route that crashed renders the app again. */
export function RouteCrashBoundary({
  client,
  platform,
  children,
}: Readonly<RouteCrashBoundaryProps>) {
  const { route } = useNav();
  return (
    <CrashBoundary client={client} platform={platform} fallback={crashFallback} resetKey={route}>
      {children}
    </CrashBoundary>
  );
}
