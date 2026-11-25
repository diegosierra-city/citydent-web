const GEO_ENDPOINT = import.meta.env.PUBLIC_GEO_ENDPOINT ?? 'https://api.citydent.app/web/geo';

let cached: string | null | undefined;

const displayNames = new Intl.DisplayNames(['es'], { type: 'region' });

export async function countryCode(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(GEO_ENDPOINT, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      const code = data && typeof data.country_code === 'string' ? data.country_code : null;
      cached = code;
      return code;
    }
  } catch {
    // Sin geolocalización, cada consumidor aplica su valor por defecto.
  }
  cached = null;
  return null;
}

export function countryName(code: string): string | null {
  try {
    return displayNames.of(code.toUpperCase());
  } catch {
    return null;
  }
}

function countryCodeFromBrowser(): string | null {
  const region = navigator.language.split('-')[1]?.toUpperCase();
  if (region === 'CO' || region === 'ES') return region;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timeZone === 'America/Bogota') return 'CO';
  if (timeZone === 'Europe/Madrid') return 'ES';
  return null;
}

export async function detectCountryCode(): Promise<string | null> {
  return countryCodeFromBrowser() ?? countryCode();
}
