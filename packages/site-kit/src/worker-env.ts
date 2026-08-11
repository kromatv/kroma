/// <reference path="./env.d.ts" />

type Ambient = { env?: Record<string, string>; waitUntil?: (p: Promise<unknown>) => void };

const drop = (p: Promise<unknown>) => void p.catch(() => {});

/**
 * The worker's env and `waitUntil`, for code reached through the SSR handler
 * rather than through `machineResponse` (which is handed both). `cloudflare:workers`
 * only exists inside workerd; off it the process environment stands in.
 */
export async function workerContext(): Promise<{
  env: Record<string, string>;
  waitUntil: (p: Promise<unknown>) => void;
}> {
  try {
    const mod = (await import(/* @vite-ignore */ 'cloudflare:workers')) as Ambient;
    const waitUntil = mod.waitUntil;
    return {
      env: mod.env ?? {},
      waitUntil: typeof waitUntil === 'function' ? waitUntil : drop,
    };
  } catch {
    return { env: processEnv(), waitUntil: drop };
  }
}

// Built once: callers key caches on the env object's identity.
let ambientEnv: Record<string, string> | undefined;

function processEnv(): Record<string, string> {
  if (ambientEnv) return ambientEnv;
  const ambient = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(ambient?.env ?? {})) {
    if (value !== undefined) out[key] = value;
  }
  ambientEnv = out;
  return out;
}
