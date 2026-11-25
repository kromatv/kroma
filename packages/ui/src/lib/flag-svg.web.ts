const COUNTRY = /^[A-Z]{2}$/;

const fetched = new Map<string, string>();

const inFlight = new Map<string, Promise<string | undefined>>();

function svgOf(loaded: unknown): string | undefined {
  if (typeof loaded !== 'object' || loaded === null || !('default' in loaded)) {
    return undefined;
  }
  return typeof loaded.default === 'string' ? loaded.default : undefined;
}

async function load(region: string): Promise<string | undefined> {
  try {
    const loaded: unknown = await import(
      `../../node_modules/country-flag-icons/string/1x1/${region}.js`
    );
    const svg = svgOf(loaded);
    if (svg !== undefined) {
      fetched.set(region, svg);
    }
    return svg;
  } catch {
    return undefined;
  } finally {
    inFlight.delete(region);
  }
}

/** The square flag of `region` as an SVG document, if it is at hand now. A
 *  browser fetches each flag on its own the first time it is drawn. */
export function flagSvgNow(region: string): string | undefined {
  return fetched.get(region);
}

/** The square flag of `region`, once it is at hand, or nothing where there is
 *  none. One fetch per flag, however many ask. */
export async function fetchFlagSvg(region: string): Promise<string | undefined> {
  const known = fetched.get(region);
  if (known !== undefined || !COUNTRY.test(region)) {
    return known;
  }
  const pending = inFlight.get(region) ?? load(region);
  inFlight.set(region, pending);
  return await pending;
}
