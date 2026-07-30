// Framework-agnostic heartbeat loop behind `useServerHealth`. Kept free of React
// so the state machine (cadence, offline/online edges, reconnect firing, probe
// coalescing) is unit-testable with fake timers see healthMonitor.test.ts.

export interface HealthMonitorOptions {
  probe: () => Promise<boolean>;
  onChange: (online: boolean) => void;
  onReconnect?: () => void;
  onlineMs?: number;
  offlineMs?: number;
  initialOnline?: boolean;
}

export interface HealthMonitor {
  recheck: () => void;
  stop: () => void;
}

/** Polls `probe()` on a self-adjusting timer: slowly while online, quickly
 * while offline. Probes immediately on start; `recheck()` cannot spawn a
 * second parallel loop while one is in flight. */
export function startHealthMonitor(opts: HealthMonitorOptions): HealthMonitor {
  const onlineMs = opts.onlineMs ?? 8000;
  const offlineMs = opts.offlineMs ?? 3000;
  let online = opts.initialOnline ?? true;
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const mark = (up: boolean) => {
    if (stopped || up === online) return;
    online = up;
    opts.onChange(up);
    if (up) opts.onReconnect?.();
  };

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(run, online ? onlineMs : offlineMs);
  };

  async function run(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      mark(await opts.probe());
    } catch {
      mark(false);
    } finally {
      inFlight = false;
      schedule();
    }
  }

  void run();

  return {
    recheck: () => {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      void run();
    },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
