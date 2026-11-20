// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Dominio de despliegue de la landing. Alimenta canonical y sitemap: la app
  // vive en api.citydent.app y no debe aparecer aquí.
  site: 'https://citydent.app',
  output: 'static',
  server: { host: true },
  integrations: [
    svelte({ inspector: false }),
    sitemap(),
  ],
  vite: {
    plugins: [tailwind()],
  },
  build: {
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
  },
});
