/**
 * Prepare brand + hero assets for delivery.
 * - Hero statico: docs/imagenes/hero.webp se copia tal cual a public/img (ya es WebP optimizado).
 * - Hero social: optimized native (1376w) + 2x upscaled (2752w, lanczos3 + mild sharpen)
 *   so large/retina viewports are not browser-upscaled from the native file.
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

const HERO_SRC = path.join(docs, 'imagenes/01.jpg');
const HERO_WEBP_SRC = path.join(docs, 'imagenes/hero.webp');
const ICON_SRC = path.join(docs, 'logo/Icon.png');
const LOGO_SRC = path.join(docs, 'logo/citydent-logo.svg');

async function main() {
  // ---- Hero estatico del sitio: master WebP sin recomprimir ----
  await copyFile(HERO_WEBP_SRC, path.join(img, 'hero.webp'));

  // ---- Hero: native optimized ----
  const meta = await sharp(HERO_SRC).metadata();
  const w = meta.width ?? 1376;
  const h = meta.height ?? 768;

  await sharp(HERO_SRC)
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(path.join(img, 'hero.jpg'));

  // ---- Hero: 2x upscaled for large / retina viewports ----
  await sharp(HERO_SRC, { limitInputPixels: w * h * 8 })
    .resize(w * 2, h * 2, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.7 })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toFile(path.join(img, 'hero-2x.jpg'));

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
    path.join(pub, 'favicon.ico'),
  ]) {
    if (existsSync(stale)) await rm(stale);
  }

  console.log('Assets preparados:');
  for (const f of ['img/hero.webp', 'img/hero.jpg', 'img/hero-2x.jpg', 'favicon.png', 'apple-touch-icon.png', 'icon-512.png', 'citydent-logo.svg']) {
    const p = path.join(pub, f);
    console.log(`  ${f}  ${existsSync(p) ? 'ok' : 'FALTA'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
