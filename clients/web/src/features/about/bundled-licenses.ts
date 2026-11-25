import { Licenses } from '@kromatv/client/licenses';

const BUNDLED = '/third-party-licenses.json';

/** The licenses of this web build, written beside it at build time. Null where
 * the build carries none, as under the dev server. */
export async function bundledLicenses(): Promise<Licenses | null> {
  try {
    const response = await fetch(BUNDLED);
    if (!response.ok) {
      return null;
    }
    const parsed = Licenses.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
