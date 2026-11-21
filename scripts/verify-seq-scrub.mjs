/**
 * Regresión visual y funcional de la apertura continua desde el fotograma cero del video.
 *
 * Controla Chrome headless por CDP (WebSocket nativo, sin dependencias):
 * navega a la página, salta a varios puntos de la pista de scroll y
 * captura el viewport para comprobar que la secuencia de fotogramas
 * avanza al bajar y retrocede al subir.
 *
 * Uso:  bun run scripts/verify-seq-scrub.mjs [url] [carpeta-salida]
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_TARGET = process.argv[2] ?? 'http://localhost:4323/';
/* Ruta absoluta: Chrome bajo spawn no resuelve un --user-data-dir relativo.
   Perfil nuevo en cada ejecución: uno reutilizado restaura las pestañas de la
   sesión anterior y el arnés puede engancharse a una oculta, donde no hay rAF
   ni IntersectionObserver y la escena nunca llega a crear su canvas. */
const PROFILE = mkdtempSync(join(tmpdir(), 'seq-verify-'));
const OUT_DIR = resolve(process.argv[3] ?? '.verify');
const PORT = 9222;
const VIEW = { w: 1440, h: 900 };

mkdirSync(OUT_DIR, { recursive: true });
assert.equal(readdirSync(join(process.cwd(), 'public/img/secuencia-04')).filter((n) => /^frame-\d+\.webp$/.test(n)).length,
  240, 'La apertura usa los 240 fotogramas de 06.mp4');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- arranque de Chrome headless con puerto de depuración ---- */
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--window-size=${VIEW.w},${VIEW.h}`,
  `--user-data-dir=${PROFILE}`,
  'about:blank',
]);

let ws;
try {
  /* ---- conexión CDP ---- */
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('Chrome no expuso el puerto de depuración');

  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJS = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  /* Un sondeo puede caer con la página a medio montar (o recién recargada por
     el servidor de desarrollo): el error se trata como "todavía no" y solo se
     reporta si se agota el tiempo. */
  const waitFor = async (expression, timeout = 20000) => {
    const start = Date.now();
    let failure = '';
    while (Date.now() - start < timeout) {
      try {
        if (await evalJS(expression)) return;
        failure = '';
      } catch (error) {
        failure = error.message;
      }
      await sleep(100);
    }
    throw new Error(`Tiempo agotado: ${expression}${failure ? ` — ${failure}` : ''}`);
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`captura: ${name}.png`);
  };
  /* Con la máquina cargada hay menos ticks de rAF por segundo: se alarga el
     recorrido en proporción a la cadencia medida para que dé tiempo a cubrir
     todo el rango de fotogramas. */
  const loadScale = async () => {
    const median = await evalJS(`new Promise(resolve => {
      const deltas = []; let last = performance.now();
      const tick = (now) => { deltas.push(now - last); last = now;
        if (deltas.length < 40) requestAnimationFrame(tick);
        else { deltas.sort((a, b) => a - b); resolve(deltas[deltas.length >> 1]); } };
      requestAnimationFrame(tick);
    })`);
    return Math.min(2.5, Math.max(1, median / 16.7));
  };

  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__sequenceErrors = [];
    addEventListener('error', event => window.__sequenceErrors.push(event.message));
    addEventListener('unhandledrejection', event => window.__sequenceErrors.push(String(event.reason)));
  ` });
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const setViewport = (width, height) => send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  const load = async () => {
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url: URL_TARGET });
    await waitFor("document.querySelector('[data-seq-poster]')?.complete && document.querySelector('[data-seq-poster]')?.naturalWidth > 0");
    assert.equal(await evalJS('document.visibilityState'), 'visible',
      'La pestaña de pruebas debe estar visible: sin visibilidad no hay rAF ni IntersectionObserver y la escena no monta su canvas');
  };
  const sceneSelector = '.opening[data-scene-seq]';
  const canvasFrame = `Number(document.querySelector('${sceneSelector} [data-seq-canvas]').dataset.frame)`;
  const canvasShown = `document.querySelector('${sceneSelector} [data-seq-canvas]').style.opacity === '1'`;
  const canvasAtStart = `${canvasShown} && ${canvasFrame} === 0`;
  const checkPosterMatch = async () => {
    const result = await evalJS(`(() => {
      const section = document.querySelector('${sceneSelector}');
      const poster = section.querySelector('[data-seq-poster]');
      const canvas = section.querySelector('[data-seq-canvas]');
      const expected = document.createElement('canvas');
      expected.width = canvas.width;
      expected.height = canvas.height;
      const context = expected.getContext('2d');
      const position = getComputedStyle(poster).objectPosition;
      const [x, y] = position.split(' ').map(value => parseFloat(value) / 100);
      const scale = Math.max(canvas.width / poster.naturalWidth, canvas.height / poster.naturalHeight);
      const width = poster.naturalWidth * scale, height = poster.naturalHeight * scale;
      context.drawImage(poster, (canvas.width - width) * x, (canvas.height - height) * y, width, height);
      const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let difference = 0;
      for (let i = 0; i < pixels.length; i++) difference += Math.abs(actual[i] - pixels[i]);
      return { difference: difference / pixels.length, position,
        canvasPosition: getComputedStyle(canvas).objectPosition,
        source: poster.getAttribute('src'),
        frameSource: section.dataset.seqBase + '/frame-000.webp?v=' + section.dataset.seqVersion,
        dimensions: [poster.naturalWidth, poster.naturalHeight],
        attributes: [Number(poster.getAttribute('width')), Number(poster.getAttribute('height'))] };
    })()`);
    assert.equal(result.source, result.frameSource, 'El póster usa exactamente el fotograma cero y su versión');
    assert.equal(result.position, result.canvasPosition, 'El póster y el canvas comparten encuadre');
    assert.deepEqual(result.attributes, result.dimensions, 'Las dimensiones declaradas coinciden con el recurso');
    assert.ok(result.difference < 0.5, `El paso del póster al canvas no cambia la imagen (${result.difference})`);
    return result;
  };
  const geometry = () => evalJS(`(() => {
    const el = document.querySelector('${sceneSelector}');
    return {
      top: el.getBoundingClientRect().top + scrollY,
      travel: el.offsetHeight - el.querySelector('[data-seq-stage]').offsetHeight,
      width: innerWidth, height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      poster: el.querySelector('[data-seq-poster]').getAttribute('src'),
      count: Number(el.dataset.seqCount),
      canvases: el.querySelectorAll('[data-seq-canvas]').length
    };
  })()`);
  const report = [];
  /* Lenis puede neutralizar un scrollTo aislado: el cabezal solo avanza
     mientras ScrollTrigger recibe deltas, así que el cabezal se mantiene
     con un micro-balanceo ±1 px cada frame, igual que traverse. */
  const settleScroll = (to, until = 'false') => evalJS(`new Promise((resolve) => {
    const start = performance.now();
    let n = 0;
    (function tick(now) {
      window.scrollTo(0, ${to} + (n++ % 2));
      if (${until}) resolve(true);
      else if (now - start < 6000) requestAnimationFrame(tick);
      else resolve(false);
    })(start);
  })`);
  const scrollForFrame = (g, frame) => g.top + g.travel * frame / (g.count - 1);

  /* Recorrido continuo, no solo extremos: el canvas debe conservar píxeles. */
  const traverse = async (from, to, duration, selector = sceneSelector) => evalJS(`new Promise(resolve => {
    const canvas = document.querySelector('${selector} [data-seq-canvas]');
    const poster = document.querySelector('${selector} [data-seq-poster]');
    const context = canvas.getContext('2d');
    const start = performance.now();
    const indices = new Set();
    const intervals = [];
    let last = start, blanks = 0, samples = 0, movingStage = 0;
    function tick(now) {
      const progress = Math.min(1, (now - start) / ${duration});
      window.scrollTo(0, ${from} + (${to} - ${from}) * progress);
      intervals.push(now - last); last = now;
      const frame = Number(canvas.dataset.frame);
      if (Number.isFinite(frame)) indices.add(frame);
      if (samples++ % 15 === 0) {
        if (Math.abs(canvas.getBoundingClientRect().top) > 1) movingStage++;
        if (getComputedStyle(canvas).opacity === '1') {
          /* Se muestrean varios puntos del lienzo: uno sin pintar está entero
             transparente, mientras que el máster tiene pasajes oscuros reales
             (06.mp4 cruza la espalda de la profesional hacia el fotograma
             120) que conservan los bordes iluminados. Un píxel negro suelto
             no es un vacío; en móviles estrechos las coordenadas se derivan
             del propio canvas para no salirse de él. */
          const w = canvas.width, h = canvas.height;
          const points = [[w >> 1, h >> 1], [(w * .2) | 0, h >> 1], [(w * .8) | 0, h >> 1],
            [w >> 1, (h * .2) | 0], [w >> 1, (h * .8) | 0]];
          const empty = points.every(([x, y]) => {
            const pixel = context.getImageData(x, y, 1, 1).data;
            return pixel[3] !== 255 || pixel[0] + pixel[1] + pixel[2] === 0;
          });
          if (empty) blanks++;
        } else if (!poster.complete || !poster.naturalWidth) blanks++;
      }
      if (progress < 1) requestAnimationFrame(tick);
      else {
        intervals.sort((a, b) => a - b);
        resolve({ distinct: indices.size, first: Math.min(...indices), last: Math.max(...indices),
          blanks, samples, movingStage, rafMedian: intervals[Math.floor(intervals.length / 2)],
          rafP95: intervals[Math.floor(intervals.length * .95)] });
      }
    }
    requestAnimationFrame(tick);
  })`);
  /* Cada tick de rAF debe estrenar fotograma hasta agotar la secuencia: la
     proporción es independiente de la cadencia, que cae con la máquina
     cargada y reduce por igual ticks y fotogramas distintos. */
  const density = (run, count) => run.distinct / Math.min(run.samples, count);
  const scrubOk = (run, count, label) => assert.ok(density(run, count) >= 0.9,
    `${label} recorre sus fotogramas (${run.distinct} en ${run.samples} ticks, rAF ${run.rafMedian.toFixed(1)} ms)`);

  for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    await setViewport(width, height);
    await load();
    await waitFor(canvasAtStart);
    await sleep(2000);
    const g = await geometry();
    assert.equal(g.top, 0, 'La pista arranca bajo el Hero, como fotograma inicial');
    const posterMatch = await checkPosterMatch();
    assert.equal(g.width, width);
    assert.equal(g.height, height);
    assert.equal(g.overflow, false);
    assert.equal(g.count, 240, 'Una sola secuencia continua para toda la apertura');
    assert.equal(g.canvases, 1, 'Un solo canvas para todos los mensajes de la apertura');
    await shot(`${label}-continuo-hero`);
    await evalJS(`scrollTo(0, ${scrollForFrame(g, 1)})`);
    await waitFor(`${canvasFrame} === 1`);
    assert.equal(await evalJS(canvasShown), true, 'El segundo fotograma continúa sobre el mismo canvas');
    await shot(`${label}-continuo-frame-001`);
    await evalJS(`scrollTo(0, 0)`);
    await waitFor(canvasAtStart);
    await checkPosterMatch();
    /* Punto medio de la pista: el zoom-out debe ir por la mitad del vídeo. */
    await evalJS(`scrollTo(0, ${scrollForFrame(g, 120)})`);
    await waitFor(`${canvasFrame} === 120`);
    await sleep(300);
    assert.equal(await evalJS(`Number(document.querySelector('.opening[data-scene-seq] [data-seq-canvas]').dataset.frame)`), 120);
    await shot(`${label}-continuo-medio`);
    await evalJS(`scrollTo(0, 0)`);
    await waitFor(canvasAtStart);
    const scale = await loadScale();
    const down = await traverse(g.top, g.top + g.travel, 12500 * scale);
    await waitFor(`${canvasFrame} === 239`);
    await shot(`${label}-continuo-final`);
    const up = await traverse(g.top + g.travel, g.top, 12500 * scale);
    await waitFor(canvasAtStart);
    assert.equal(down.blanks + up.blanks, 0);
    assert.equal(down.movingStage + up.movingStage, 0, 'El fondo no se desliza como un segundo panel');
    scrubOk(down, g.count, 'La apertura avanza');
    scrubOk(up, g.count, 'La apertura retrocede');
    for (const [name, frame] of [['01-cuarto', 60], ['02-mitad', 120], ['03-tres-cuartos', 180]]) {
      await evalJS(`scrollTo(0, ${scrollForFrame(g, frame)})`);
      await waitFor(`${canvasFrame} === ${frame}`);
      await shot(`${label}-${name}`);
    }
    assert.deepEqual(await evalJS('window.__sequenceErrors'), []);
    report.push({ label, ...g, posterMatch, down, up });
    console.log(`${label}: scrub completo, avance ${down.distinct}/${down.samples}, retroceso ${up.distinct}/${up.samples}, vacíos ${down.blanks + up.blanks}`);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await waitFor("!document.querySelector('[data-seq-active]')");
    assert.equal(await evalJS("getComputedStyle(document.querySelector('.care-first .care-message')).opacity"), '1',
      'El cambio de preferencia restaura los textos sin recargar');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  }

  /* --- Footer: secuencia 03 con scrub reversible y carga diferida --- */
  await setViewport(1440, 900);
  await load();
  /* El script diferido de la página instala las escenas; esperar a que el
     footer exista y quede activo evita leer un estado aún sin montar. */
  await waitFor("document.querySelector('.opening[data-scene-seq]').hasAttribute('data-seq-active')");
  const fCanvasFrame = `Number(document.querySelector('#pie [data-seq-canvas]').dataset.frame)`;
  const footer = await evalJS(`(() => {
    const el = document.querySelector('#pie');
    const stage = el.querySelector('[data-seq-stage]');
    return {
      count: Number(el.dataset.seqCount),
      canvases: el.querySelectorAll('[data-seq-canvas]').length,
      top: el.getBoundingClientRect().top + scrollY,
      travel: el.offsetHeight - stage.offsetHeight,
      active: el.hasAttribute('data-seq-active'),
      loaded: Number(el.dataset.seqLoaded ?? 0),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert.equal(footer.count, 72, 'El footer usa los 72 fotogramas de 08.mp4');
  assert.equal(footer.canvases, 1);
  assert.equal(footer.active, true, 'El footer reserva su pista sticky con movimiento activo');
  assert.equal(footer.overflow, false);
  assert.equal(footer.loaded, 0, 'El footer no descarga su secuencia mientras se está en el Hero');
  await evalJS(`scrollTo(0, ${footer.top - 300})`);
  await waitFor("Number(document.querySelector('#pie').dataset.seqLoaded) === 72");
  await evalJS(`scrollTo(0, ${footer.top})`);
  await waitFor(`${fCanvasFrame} === 0`);
  await shot('footer-inicio');
  const footerScale = await loadScale();
  const footerDown = await traverse(footer.top, footer.top + footer.travel, 4200 * footerScale, '#pie');
  await waitFor(`${fCanvasFrame} === 71`);
  await shot('footer-final');
  const footerUp = await traverse(footer.top + footer.travel, footer.top, 4200 * footerScale, '#pie');
  await waitFor(`${fCanvasFrame} === 0`);
  assert.equal(footerDown.blanks + footerUp.blanks, 0, 'El canvas del footer nunca se vacía');
  scrubOk(footerDown, footer.count, 'El footer avanza');
  scrubOk(footerUp, footer.count, 'El footer retrocede');
  assert.deepEqual(await evalJS('window.__sequenceErrors'), []);
  report.push({ label: 'footer', ...footer, down: footerDown, up: footerUp });
  console.log(`footer: carga diferida, avance ${footerDown.distinct}/${footerDown.samples}, retroceso ${footerUp.distinct}/${footerUp.samples}, vacíos ${footerDown.blanks + footerUp.blanks}`);

  /* Composición adicional: tablet, móvil corto y reflujo equivalente a zoom. */
  for (const [label, width, height] of [['tablet', 768, 1024], ['mobile-corto', 390, 667], ['reflujo-200', 720, 450]]) {
    await setViewport(width, height);
    await load();
    const active = height >= 600;
    await waitFor(`document.querySelector('.opening[data-scene-seq]').hasAttribute('data-seq-active') === ${active}`);
    assert.equal(await evalJS("document.querySelector('.opening[data-scene-seq]').hasAttribute('data-seq-active')"), active);
    for (const id of ['citydent-responde', 'equipo']) {
      await evalJS(`scrollTo(0, document.getElementById('${id}').getBoundingClientRect().top + scrollY)`);
      await sleep(700);
      const layout = await evalJS(`(() => {
        const section = document.getElementById('${id}');
        const message = section.querySelector('.care-message');
        const rect = message.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, opacity: getComputedStyle(message).opacity,
          overflow: document.documentElement.scrollWidth > innerWidth,
          height: section.offsetHeight, content: section.scrollHeight };
      })()`);
      assert.equal(layout.overflow, false);
      assert.equal(layout.opacity, '1');
      assert.ok(layout.content <= layout.height + 1, 'El contenido cabe en su sección');
      if (active) assert.ok(layout.top >= height * .5 && layout.bottom <= height, 'Lectura bajo las personas y dentro del viewport');
      await shot(`${label}-${id}`);
      report.push({ label: `${label}-${id}`, ...layout });
    }
  }
  await setViewport(390, 844);

  /* Recursos ausentes en la secuencia: nunca se vacía el canvas. */
  for (const [pattern, missingFrame] of [['*/secuencia-04/frame-060.webp*', 60], ['*/secuencia-04/frame-175.webp*', 175]]) {
    await send('Network.setBlockedURLs', { urls: [pattern] });
    await load();
    await waitFor("document.querySelector('.opening[data-scene-seq]').hasAttribute('data-seq-active')");
    await waitFor(canvasAtStart);
    const g = await geometry();
    for (const frame of [missingFrame - 1, missingFrame, missingFrame + 1]) {
      /* El balanceo se mantiene hasta que el fotograma esperado esté
         pintado: con el cabezal congelado, el último decode no volvería a
         invocar draw(). El fotograma bloqueado se conforma con el cabezal,
         su comprobación es justamente que el dibujo NO avance. */
      const head = "document.querySelector('.opening[data-scene-seq] [data-seq-canvas]').dataset";
      const until = frame === missingFrame ? `${head}.targetFrame === '${frame}'`
        : `${head}.targetFrame === '${frame}' && ${head}.frame === '${frame}'`;
      assert.ok(await settleScroll(scrollForFrame(g, frame), until),
        `El cabezal alcanza el fotograma ${frame} con ${pattern}`);
      await waitFor(`document.querySelector('.opening[data-scene-seq] [data-seq-canvas]').dataset.targetFrame === '${frame}'`);
      if (frame === missingFrame) {
        await sleep(500);
        assert.equal(await evalJS(canvasFrame), missingFrame - 1);
      } else await waitFor(`${canvasFrame} === ${frame}`);
    }
    report.push({ label: pattern, retained: missingFrame - 1, resumed: missingFrame + 1 });
  }
  await send('Network.setBlockedURLs', { urls: [] });

  /* Red lenta y scroll inmediato: permite retener el plano, nunca borrarlo. */
  await setViewport(1440, 900);
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 128 * 1024, uploadThroughput: 64 * 1024,
  });
  await load();
  await waitFor("document.querySelector('[data-seq-active]') !== null");
  const slow = await geometry();
  const slowRun = await traverse(slow.top, slow.top + slow.travel, 3000);
  assert.equal(slowRun.blanks, 0, 'Red lenta: siempre queda un póster o fotograma');
  await shot('red-lenta');
  report.push({ label: 'red-lenta', ...slowRun });
  const slowReverse = await traverse(slow.top + slow.travel, slow.top, 3000);
  assert.equal(slowReverse.blanks, 0);
  report.push({ label: 'red-lenta-retroceso', ...slowReverse });
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  /* El fallback no oculta contenido ni obliga a cruzar una pista vacía. */
  for (const mode of ['reduced-motion', 'no-js']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: mode === 'reduced-motion' ? 'reduce' : 'no-preference' }] });
    await send('Emulation.setScriptExecutionDisabled', { value: mode === 'no-js' });
    await load();
    await sleep(500);
    const fallback = await evalJS(`(() => ({
      active: !!document.querySelector('[data-seq-active]'),
      height: document.querySelector('.opening[data-scene-seq]').offsetHeight,
      viewport: innerHeight,
      headings: [...document.querySelectorAll('#inicio h1, .opening[data-scene-seq] h2')].map(el => ({ text: el.textContent.trim(), visible: getComputedStyle(el).visibility !== 'hidden' })),
      poster: document.querySelector('[data-seq-poster]').getAttribute('src'),
      end: document.querySelector('img[data-seq-fallback]').getAttribute('src')
    }))()`);
    assert.equal(fallback.active, false);
    assert.equal(await evalJS("getComputedStyle(document.querySelector('.care-first .care-message')).opacity"), '1');
    assert.equal(fallback.height, fallback.viewport * 4);
    assert.ok(fallback.headings.length === 4 && fallback.headings.every(h => h.visible));
    const secondFallback = await evalJS(`(() => {
      const scene = document.querySelector('.care-story');
      return { height: scene.offsetHeight, first: scene.querySelector('.care-media img').getAttribute('src'),
        last: scene.querySelector('img[data-seq-fallback]').getAttribute('src') };
    })()`);
    assert.equal(secondFallback.height, fallback.viewport * 2, 'Sin pista ampliada en la pausa de lectura');
    assert.match(secondFallback.first, /secuencia-04\/frame-143/);
    assert.match(secondFallback.last, /secuencia-04\/frame-239/);
    await evalJS("scrollTo(0, document.querySelector('.care-story').offsetTop)");
    await shot(`${mode}-02`);
    assert.match(fallback.poster, /secuencia-04\/frame-000\.webp/, 'Sin JS ni motion el póster sigue siendo el fotograma cero del video');
    assert.match(fallback.end, /frame-096/);
    await shot(mode);
    report.push({ label: mode, ...fallback });
  }
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('OK: póster idéntico al fotograma cero, secuencia continua, carga diferida del footer, avance, retroceso, píxeles, móvil, red lenta y fallbacks.');
} finally {
  ws?.close();
  /* En Windows chrome.kill() solo termina el proceso padre: los hijos
     conservan el puerto 9222 y la siguiente ejecución hablaría con un
     navegador zombi. */
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F']);
  else chrome.kill();
}
