import { countryCode } from './geo';

export type Market = 'es' | 'us' | 'co';

export function marketForCountry(countryCode: string): Market {
  switch (countryCode.toUpperCase()) {
    case 'ES':
      return 'es';
    case 'CO':
      return 'co';
    default:
      // EE. UU. y cualquier país sin mercado propio: dólares por defecto.
      return 'us';
  }
}

function marketFromBrowser(): Market | null {
  const region = navigator.language.split('-')[1]?.toUpperCase();
  if (region === 'CO' || region === 'ES') return marketForCountry(region);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timeZone === 'America/Bogota') return 'co';
  if (timeZone === 'Europe/Madrid') return 'es';
  return null;
}

export async function detectMarket(): Promise<Market> {
  const browserMarket = marketFromBrowser();
  if (browserMarket) return browserMarket;

  const code = await countryCode();
  return code ? marketForCountry(code) : 'us';
}

export function applyMarket(market: Market): void {
  document.documentElement.dataset.market = market;
  document
    .querySelectorAll<HTMLElement>('[data-price-es][data-price-us][data-price-co]')
    .forEach((el) => {
      const value = el.getAttribute(`data-price-${market}`);
      if (value !== null) el.textContent = value;
    });
}

export async function initMarket(): Promise<void> {
  const market = await detectMarket();
  applyMarket(market);
}
