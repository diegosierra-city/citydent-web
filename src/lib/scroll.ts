/**
 * Inicialización centralizada del scroll de CityDent.
 *
 * Fuente única de GSAP / ScrollTrigger / Lenis para todo el proyecto.
 * Los componentes deben importar desde aquí en lugar de importar `gsap`
 * directamente, para asegurar que comparten la MISMA instancia registrada.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/** True si el usuario pidió reducir el movimiento. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let lenis: Lenis | null = null;
let tickerCallback: ((time: number) => void) | null = null;
let initialized = false;

/**
 * Arranca Lenis y lo sincroniza con el ticker de GSAP.
 * Se llama una sola vez desde Layout.astro.
 */
export function initScroll(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // Sin Lenis con movimiento reducido: ScrollTrigger sigue funcionando
  // con el scroll nativo del navegador.
  if (prefersReducedMotion()) {
    document.documentElement.dataset.scrollMode = 'native';
    return;
  }

  lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 2,
  });

  lenis.on('scroll', ScrollTrigger.update);

  // Se guarda la referencia para poder eliminarla luego con ticker.remove()
  tickerCallback = (time: number) => {
    lenis?.raf(time * 1000);
  };
  gsap.ticker.add(tickerCallback);
  gsap.ticker.lagSmoothing(0);

  document.documentElement.dataset.scrollMode = 'smooth';
}

/** Detiene Lenis y quita el callback del ticker de GSAP. */
export function destroyScroll(): void {
  lenis?.destroy();
  lenis = null;

  if (tickerCallback) {
    gsap.ticker.remove(tickerCallback);
    tickerCallback = null;
  }

  initialized = false;
  delete document.documentElement.dataset.scrollMode;
}

/** Devuelve la instancia viva de Lenis, o null si está en modo nativo. */
export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Scroll a un selector o elemento, respetando Lenis cuando está activo.
 * `offset` compensa la altura del header fijo (px).
 */
export function scrollToTarget(target: string | HTMLElement, offset = 88): void {
  if (typeof window === 'undefined') return;

  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;

  if (lenis) {
    lenis.scrollTo(el as HTMLElement, { offset: -offset });
    return;
  }

  // Fallback nativo (movimiento reducido o Lenis no inicializado)
  const top =
    (el as HTMLElement).getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({
    top,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

/** Utilidad para crear un Timeline ligado al scroll de un elemento. */
export function scrubTimeline(
  trigger: gsap.DOMTarget,
  vars: gsap.TimelineVars = {},
): gsap.core.Timeline {
  return gsap.timeline({
    scrollTrigger: {
      trigger,
      start: 'top 80%',
      end: 'bottom 20%',
      scrub: 1,
    },
    ...vars,
  });
}

/** Registra un ScrollTrigger y devuelve la instancia para poder liberarlo. */
export function createTrigger(
  vars: ScrollTrigger.Vars,
): ScrollTrigger {
  return ScrollTrigger.create(vars);
}

export { gsap, ScrollTrigger, Lenis };
