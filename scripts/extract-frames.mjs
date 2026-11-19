/**
 * Regenera la secuencia de fotogramas de una escena desde su máster limpio
 * docs/videos/NN.mp4. Requiere ffmpeg en el PATH.
 *
 * Uso:  bun run scripts/extract-frames.mjs [03|04]
 * La apertura (04) sale de docs/videos/06.mp4 (1248×704, 24 fps, 240
 * fotogramas): se escala con lanczos a 1920 de ancho —1920×1082 al
 * conservarse el ratio del máster— y se recorta a 1920×960 (2:1) centrado
 * para coincidir con el canvas del Hero. El 2:1 se conserva con scale+crop
 * centrado: se pierden unos 61 px superior e inferiores en lugar de
 * deformar la imagen.
 * El identificador de secuencia y el del máster no coinciden: la apertura
 * se entrega como secuencia-04 aunque su origen sea 06.mp4.
 * El footer (03) sale de docs/videos/08.mp4, el máster corregido
 * (1920×1080, 24 fps, 72 fotogramas, sin el salto de encuadre final que
 * tenía 07.mp4), y se entrega tal cual, sin recorte, porque el pie usa
 * un lienzo 16:9.
 *
 * Parámetros actuales: cadencia original (24 fps), webp q82.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';

const sequence = process.argv[2] ?? '04';
if (!['03', '04'].includes(sequence)) throw new Error('Selecciona la secuencia 03 (footer) o 04 (apertura).');
const root = process.cwd();
/* Todas las secuencias salen de másteres limpios en docs/videos. */
const masters = { '04': '06', '03': '08' };
const entrada = join(root, '../docs/videos', `${masters[sequence]}.mp4`);
if (!existsSync(entrada)) throw new Error(`Falta el máster ${entrada}`);
const directory = join(root, `public/img/secuencia-${sequence}`);
mkdirSync(directory, { recursive: true });
for (const stale of readdirSync(directory).filter((name) => /^frame-\d+\.webp$/.test(name))) {
  rmSync(join(directory, stale));
}
const salida = join(directory, 'frame-%03d.webp');
const filters = {
  '04': 'scale=1920:-2:flags=lanczos,crop=1920:960',
  '03': 'fps=24,scale=1920:1080:flags=lanczos',
};
const filter = filters[sequence];

const resultado = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-loglevel', 'error',
    '-i', entrada,
    '-vf', filter,
    '-fps_mode', 'passthrough',
    '-start_number', '0',
    '-c:v', 'libwebp',
    '-quality', '82',
    salida,
  ],
  { stdio: 'inherit' },
);

if (resultado.status !== 0) {
  console.error('ffmpeg falló: ¿está instalado y en el PATH?');
  process.exit(resultado.status ?? 1);
}
const frames = readdirSync(directory).filter((name) => /^frame-\d+\.webp$/.test(name));
const bytes = frames.reduce((sum, name) => sum + statSync(join(directory, name)).size, 0);
console.log(`Secuencia ${sequence}: ${frames.length} fotogramas, ${(bytes / 1024 / 1024).toFixed(2)} MB en ${directory}`);
