# Design — CityDent

<!-- impeccable:design-schema 1 -->

Direction contract (hero / apertura):
- THESIS: la apertura es una única escena fotográfica inmersiva vista desde el sillón del paciente; el mensaje se revela sobre ella. Rechaza el hero SaaS por defecto (titular centrado + 3 tarjetas + blobs de degradado).
- OWN-WORLD: navy clínico profundo como tinta y campo de contraste; un único acento comprometido azul→turquesa; motivo recurrente de la burbuja de chat del logo; blancos fotográficos cálidos.
- STORY: el visitante ve a una clínica real desde el punto de vista del paciente, entiende de inmediato que se vende un asistente de IA para clínicas y acciona «Probar CityDent».
- FIRST VIEWPORT: foto a sangre con scrim navy localizado anclado a la izquierda/abajo; columna de texto alineada a la izquierda (~46% izquierdo) directamente sobre la imagen, con sombra tipográfica para contraste; rostro e instrumentos despejados; cue de scroll discreto.
- FORM: hero fotográfico inmersivo con texto asimétrico a la izquierda, scrim localizado y sombra tipográfica: sin recuadro contenedor sobre la foto.

## Color

Estrategia: **Committed** — el navy de marca carga los campos grandes (scrims, header al hacer scroll, footer, panel de texto móvil); el acento azul→turquesa se reserva para acciones y énfasis; el resto es blanco fotográfico/neutro clínico.

- `--color-ink` / navy: `#0C2641` (tinta principal y campos oscuros).
- `--color-brand-blue`: `#1D91E4`; `--color-brand-teal`: `#26BDC6`. Acento = degradado blue→teal (135deg).
- `--color-bubble-start` `#5AAEE0` → `--color-bubble-end` `#38C3C4`: SOLO para el motivo burbuja (demo/asistente), nunca como fondo de página.
- Neutros: blanco cálido de fondo `#FFFFFF`, gris de apoyo `#494D56`.
- Prohibido: neon sobre negro, glassmorphism generalizado, blobs de degradado decorativos, terracota/cream editorial.

## Typography

- Display: **Jost** (revival geométrico de Futura) — continúa las letterforms geométricas del logotipo. Pesos 400–600. Para H1/H2, wordmark y etiquetas grandes.
- Body/UI: **Source Sans 3** — humanista, muy legible en párrafos largos en español; tono profesional-cercano. Pesos 400–600.
- Jerarquía: H1 display grande con leading apretado (~1.05); apoyo body ~1.125–1.25rem leading relajado; etiquetas en body semibold con tracking amplio y versales donde corresponda.
- Un único H1 por página; titulares de sección con jerarquía coherente.
- El texto con degradado (`gradient-text`) está RESERVADO al wordmark «Dent», fiel al `dentGrad` del logo; nunca en titulares, métricas ni énfasis de cuerpo (ahí se usa color sólido de acento).

## Form & motif

- Motivo de marca: la **burbuja de chat** del logo. Radios tipo burbuja (asimétricos, cola opcional) para contenedores del asistente/demo y para pills de etiqueta. No aplicar radio uniforme a todo.
- Botones: pill (radio completo) para CTA principales; el primario lleva el acento blue→teal; el secundario es contorno sobre el campo activo.
- Composición: asimétrica y fotográfica; el texto nunca tapa rostros ni instrumentos; scrims localizados (degradado direccional) en lugar de velos opacos sobre toda la imagen. El copy del hero vive directamente sobre la foto con sombra tipográfica (sin panel-caja); los contenedores tipo burbuja se reservan al asistente/demo.

## Motion

- Scroll suave con Lenis + GSAP ScrollTrigger (instancia única en `src/lib/scroll.ts`).
- Apertura continua: `#inicio` reúne las cuatro secciones sobre un único canvas sticky con una sola secuencia: `docs/videos/06.mp4` (máster limpio 1248×704, 10 s, 240 fotogramas a 24 fps) extraído con `scripts/extract-frames.mjs 04`, escalado con lanczos a 1920 y recortado a 1920×960 (2:1). El fotograma inicial es la foto del Hero: `docs/imagenes/hero.webp` (copia sin recomprimir a `public/img/hero.webp` vía `scripts/prepare-assets.mjs`, 2096×1184) como póster estático bajo el mensaje, con encuadre propio (`object-position: 50% 30%`, sin el paneo de la secuencia). Al iniciar el scroll abajo, el canvas de la secuencia entra en fundido (transición de opacidad 0,45 s) desde el fotograma 1; al retroceder al cabezal 0, se retira y devuelve la foto (`data-seq-static-poster`). Los textos mantienen su flujo y sus anclas.
- Un único tween GSAP con `scrub: 0.2` mapea el progreso de la pista (600svh, 500svh útiles) a los 240 fotogramas, en avance y retroceso. El zoom-out del vídeo hace de recorrido de cámara: `#cada-paciente` (~0-40 %), `#citydent-responde` (~40-80 %) y `#equipo` (cierre mirando a cámara). Los mensajes de `#cada-paciente` y `#citydent-responde` se retiran antes de salir de su zona de contraste. Con menos de 600 px de altura, todo el recorrido utiliza lectura estática sin pista extendida; las imágenes de las dos últimas secciones ocupan la parte superior en móvil/tablet. En vertical el recorte 2:1 es estrecho, así que un paneo suave (`--sequence-x`, hitos [54, 55, 50, 30, 36] % medidos sobre los fotogramas 0/60/120/180/239 de `06.mp4`) sigue los rostros durante el zoom-out; en horizontal el lienzo queda fijo al centro. Los dos fotogramas de fallback que no reciben el paneo fijan su propio encuadre (42 % en la pausa central y 36 % en el cierre) para no perder a la profesional.
- Render sin parpadeos: no se cambia el `src` visible ni se borra el canvas entre fotogramas; solo se dibujan imágenes decodificadas. Cuatro descargas concurrentes priorizan la posición actual. Los recursos se almacenan comprimidos y la caché de ImageBitmap se limita a 9 planos en móvil o 21 en escritorio, más hasta dos decodificaciones en curso. Una carga lenta conserva el último plano válido.
- Footer con vídeo: `docs/videos/08.mp4` (máster corregido 1920×1080, 3 s, 72 fotogramas a 24 fps, sin el salto de encuadre del último fotograma que tenía 07.mp4) es el fondo del pie mediante la misma `setupSequence`, ahora simplificada a escenas de secuencia única (`data-seq-base/count/version`). `scripts/extract-frames.mjs 03` entrega 72 WebP a 1920×1080 sin recorte (el lienzo del pie es 16:9, ~3,6 MB). El pie reserva una pista sticky de 250svh (150svh de recorrido útil); el equipo pasa de gesto neutro a sonrisa con brazos cruzados según el scroll, en avance y retroceso. La secuencia es decorativa (`aria-hidden`), con el póster estático de fallback. La carga es diferida (`data-seq-deferred`): no descarga hasta acercarse a un viewport del pie. En pantallas compactas (≤1023 px de ancho y <760 px de alto) o con movimiento reducido queda el equipo estático tras el scrim, sin pista extendida.
- Revelados de contenido (`src/lib/reveal.ts`, arrancado con `initReveals()` desde `src/pages/index.astro`): las bandas posteriores a la apertura entran con `data-reveal="soft|up|rise|mask|rule"` —o `list` en el contenedor más `data-reveal-item` en cada hijo, con stagger de 0,09 s—, ease `power3.out`, disparo en `top 90%` y una sola vez. Dos momentos autorados: `data-transcript` entrega las burbujas de la conversación una a una (0,4 s entre mensajes) y `data-contrast` ilumina el antes/después con `scrub: 0.6`. El contenido es visible por defecto (los estados iniciales se aplican con `immediateRender: false` y los estilos inline se limpian al terminar), no se crea ningún tween con movimiento reducido y todos se liberan en `astro:before-swap`.
- Orden del embudo tras la apertura: `#coste` → `#tiempo` → `#demo` → `#beneficios` → `#confianza` → `#precios` → `#puesta-en-marcha` → `#preguntas` → `#contacto` → pie. `#precios` muestra tarifas estáticas en EUR: la carga desde API con geolocalización del visitante queda pendiente y su punto de integración está documentado en `src/components/sections/Precios.astro`.
- Sin créditos de atribución en las secuencias: verificados los derechos del material (rostros ficticios generados con IA, sin derechos de imagen de terceros ni obligación de atribución). Sin JS, sin soporte de canvas/ImageBitmap o con movimiento reducido, los mensajes quedan en flujo normal con hero.webp como fondo del Hero y fotogramas representativos de `06.mp4` como imágenes estáticas (096/143/239 en las pausas de lectura), sin pista extendida.
- Respeta `prefers-reduced-motion`: sin paralaje, transiciones mínimas, contenido visible por defecto.
- Sin sonido automático en ningún medio.

## Imagery

- Visuales con protagonismo: `docs/imagenes/hero.webp` (generada con IA, mismo encuadre desde el sillón del paciente) es el póster/fotograma inicial del Hero; `docs/videos/06.mp4` continúa la pista desde el primer scroll y aleja la cámara hasta el gabinete completo y el cierre sonriente a cámara; `docs/imagenes/01.jpg` permanece como recurso social (ogImage). El vídeo ilustra atención clínica, no clientes ni una demostración del software. `08.mp4` (equipo posando) es el fondo animado del pie de página; ilustra al equipo, no clientes ni resultados. La fotografía de tres profesionales sigue pendiente; `02.jpg` queda como recurso alternativo. `docs/animaciones/01.mp4` y `02.mp4` quedaron obsoletos como fuente de la apertura, y `07.mp4` como fuente del pie.
- Recortes que conservan rostros e instrumentos; en móvil el texto ocupa superficie propia si el recorte perjudica la lectura.
- Póster del Hero con dimensiones explícitas y `fetchpriority` alto (LCP); versión de las URLs ligada a la extracción para invalidar fotogramas antiguos en caché. Precarga progresiva de la secuencia sin bloquear el contenido ni los CTA: cuatro descargas concurrentes priorizando los vecinos del cabezal.

## Accessibility

- Contraste AA en texto sobre scrim y sobre campos de color; foco visible; navegación por teclado; encabezados ordenados.
- Contenido esencial legible sin JS y con zoom; alternativas estáticas si un medio falla.
