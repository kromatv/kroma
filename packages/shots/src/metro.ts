// A native shell built for development carries no JS bundle: without Metro it
// launches straight into a redbox ("No script URL provided"), which simctl and
// adb will photograph as cheerfully as they would the real screen. Checking
// first is what keeps a redbox out of a pull request.

const DEFAULT_METRO_PORT = 8081;
const PROBE_TIMEOUT_MS = 2000;

export async function assertMetro(port: number, targetId: string, start: string): Promise<void> {
  let body: string;
  try {
    const response = await fetch(`http://localhost:${port}/status`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    body = await response.text();
  } catch {
    body = '';
  }
  if (body.includes('packager-status:running')) return;
  throw new Error(
    `${targetId}: no Metro bundler on port ${port}, so the app would open on a redbox. ` +
      `Start it with \`${start}\`, or pass --metro-port if it is on another one.`,
  );
}

export { DEFAULT_METRO_PORT };
