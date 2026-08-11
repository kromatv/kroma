type Workerd = { env?: Record<string, string>; waitUntil?: (p: Promise<unknown>) => void };

const ambient = (globalThis as { KROMA_WORKERD?: Workerd }).KROMA_WORKERD;
if (!ambient) throw new Error('cloudflare:workers exists only inside workerd');

export const env = ambient.env;
export const waitUntil = ambient.waitUntil;
