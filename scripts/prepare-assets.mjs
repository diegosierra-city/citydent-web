/**
 * Prepare brand + hero assets for delivery.
 * - Hero estatico: docs/imagenes/hero.webp se copia tal cual a public/img (ya es WebP optimizado).
 *   Es además la imagen social (og:image) del sitio: se NO debe regenerar hero.jpg, se retiró
 *   porque intervenía en el salto de la animación del hero.
 * - Icons: brand favicon.png / apple-touch-icon.png from docs/logo/Icon.png.
 * - Logo: copy the brand lockup SVG into public/.
 * Run: bun run scripts/prepare-assets.mjs
 */
import sharp from 'sharp';
import { copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const docs = path.resolve(root, '../docs');
const pub = path.join(root, 'public');
const img = path.join(pub, 'img');

const HERO_WEBP_SRC = path.join(docs, 'imagenes/hero.webp');
const ICON_SRC = path.join(docs, 'logo/Icon.png');
const LOGO_SRC = path.join(docs, 'logo/citydent-logo.svg');

async function main() {
  // ---- Hero estatico del sitio: master WebP sin recomprimir (póster + og:image) ----
  await copyFile(HERO_WEBP_SRC, path.join(img, 'hero.webp'));

  // ---- Icons from brand Icon.png ----
  await sharp(ICON_SRC).resize(64, 64).png().toFile(path.join(pub, 'favicon.png'));
  await sharp(ICON_SRC).resize(180, 180).png().toFile(path.join(pub, 'apple-touch-icon.png'));
  await sharp(ICON_SRC).resize(512, 512).png().toFile(path.join(pub, 'icon-512.png'));

  // ---- Brand logo lockup ----
  await copyFile(LOGO_SRC, path.join(pub, 'citydent-logo.svg'));

  // ---- Remove test/placeholder assets ----
  for (const stale of [
    path.join(img, 'fase-01.jpg'),
    path.join(img, 'fase-02.jpg'),
    path.join(img, 'fase-03.jpg'),
    path.join(img, 'hero.jpg'),
    path.join(img, 'hero-2x.jpg'),
    path.join(pub, 'favicon.ico'),
  ]) {
    if (existsSync(stale)) await rm(stale);
  }

  console.log('Assets preparados:');
  for (const f of ['img/hero.webp', 'favicon.png', 'apple-touch-icon.png', 'icon-512.png', 'citydent-logo.svg']) {
    const p = path.join(pub, f);
    console.log(`  ${f}  ${existsSync(p) ? 'ok' : 'FALTA'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
