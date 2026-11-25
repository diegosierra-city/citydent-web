import { detectCountryCode } from './geo';

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

export async function detectMarket(): Promise<Market> {
  const code = await detectCountryCode();
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
