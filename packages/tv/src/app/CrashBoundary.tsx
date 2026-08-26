import type { KromaClient } from '@kroma/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { buildCrashReport } from '#tv/app/crashReport';
import { crashReportingPrefStore } from '#tv/app/crashReportingPref';

interface Props {
  client: KromaClient | null;
  platform: string;
  /** Rendered instead of the broken tree. Given the reset, so the screen can
   *  offer to try again rather than only telling the viewer to. */
  fallback: (retry: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

/** App-level error boundary: on a render-time crash it shows `fallback` instead
 * of the broken tree, and, only when the user opted in, posts a
 * [`CrashReport`] to the connected server (best-effort, never rethrown). */
export class CrashBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (crashReportingPrefStore.get() !== 'on') return;
    const { client, platform } = this.props;
    if (!client) return;
    const report = buildCrashReport(error, info.componentStack, platform, Date.now());
    client.reportCrash(report).catch(() => {});
  }

  private readonly retry = (): void => {
    this.setState({ crashed: false });
  };

  render(): ReactNode {
    return this.state.crashed ? this.props.fallback(this.retry) : this.props.children;
  }
}
