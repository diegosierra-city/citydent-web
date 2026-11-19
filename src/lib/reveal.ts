/**
 * Revelados suaves de los bloques de contenido.
 *
 * Reglas que sostiene este módulo:
 *  - El contenido es visible por defecto. Ninguna clase CSS lo oculta: si el
 *    script falla, la página se lee igual. Los estados iniciales se aplican con
 *    `immediateRender: false`, es decir, sólo cuando el tween va a empezar.
 *  - Con `prefers-reduced-motion` no se crea nada.
 *  - Cada revelado ocurre una sola vez (`once: true`) y limpia sus estilos
 *    inline al terminar, para no interferir con sticky, clip-path ni filtros.
 *
 * Uso en el marcado:
 *  - `data-reveal="up|rise|soft|mask|rule"`  en el elemento a revelar.
 *  - `data-reveal="list"` en el contenedor + `data-reveal-item` en cada hijo.
 *  - `data-transcript` (momento autorado): las burbujas llegan una a una.
 *  - `data-contrast` (momento autorado): el antes/después se ilumina al scroll.
 */
import { gsap, prefersReducedMotion } from './scroll';

const EASE = 'power3.out';
const START = 'top 90%';

type Disposer = () => void;

interface Variant {
  from: gsap.TweenVars;
  to: gsap.TweenVars;
  duration?: number;
  start?: string;
}

const VARIANTS: Record<string, Variant> = {
  soft: {
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration: 0.7,
  },
  up: {
    from: { opacity: 0, y: 26 },
    to: { opacity: 1, y: 0 },
    duration: 0.85,
  },
  rise: {
    from: { opacity: 0, y: 48 },
    to: { opacity: 1, y: 0 },
    duration: 1,
  },
  /* Revelado por máscara: el titular sube tras un borde recortado */
  mask: {
    from: { clipPath: 'inset(0 0 101% 0)', y: 18 },
    to: { clipPath: 'inset(0 0 0% 0)', y: 0 },
    duration: 1,
    start: 'top 92%',
  },
  rule: {
    from: { scaleX: 0, opacity: 0 },
    to: { scaleX: 1, opacity: 1 },
    duration: 0.9,
  },
};

const CLEANUP_PROPS = 'transform,opacity,clipPath';

/**
 * Arranca los revelados dentro de `scope` y devuelve la función que los libera.
 */
export function initReveals(scope: ParentNode = document): Disposer {
  if (prefersReducedMotion()) return () => {};

  const tweens: gsap.core.Tween[] = [];

  const track = (tween: gsap.core.Tween): gsap.core.Tween => {
    tweens.push(tween);
    return tween;
  };

  const reveal = (
    target: gsap.DOMTarget,
    variant: Variant,
    trigger: Element,
    extra: gsap.TweenVars = {},
  ) =>
    track(
      gsap.fromTo(target, variant.from, {
        ease: EASE,
        duration: variant.duration ?? 0.85,
        immediateRender: false,
        clearProps: CLEANUP_PROPS,
        ...variant.to,
        ...extra,
        scrollTrigger: {
          trigger,
          start: variant.start ?? START,
          once: true,
        },
      }),
    );

  /* ---- Revelados por variante ---------------------------------------- */
  scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    const name = el.dataset.reveal ?? 'up';

    if (name === 'list') {
      const items = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal-item]'));
      if (!items.length) return;
      reveal(items, VARIANTS.up, el, { stagger: 0.09 });
      return;
    }

    const variant = VARIANTS[name] ?? VARIANTS.up;
    if (name === 'rule') {
      reveal(el, { ...variant, from: { ...variant.from, transformOrigin: 'left center' } }, el);
      return;
    }
    reveal(el, variant, el);
  });

  /* ---- Momento autorado 1: la transcripción llega mensaje a mensaje ---- */
  scope.querySelectorAll<HTMLElement>('[data-transcript]').forEach((panel) => {
    const bubbles = Array.from(panel.querySelectorAll<HTMLElement>('[data-bubble]'));
    if (!bubbles.length) return;

    bubbles.forEach((bubble, index) => {
      const side = bubble.dataset.bubble === 'patient' ? 'right bottom' : 'left bottom';
      reveal(
        bubble,
        {
          from: { opacity: 0, y: 18, scale: 0.96, transformOrigin: side },
          to: { opacity: 1, y: 0, scale: 1 },
          duration: 0.5,
          start: 'top 84%',
        },
        panel,
        { ease: 'power2.out', delay: index * 0.4 },
      );
    });
  });

  /* ---- Momento autorado 2: el martes se ilumina con el scroll ---------- */
  scope.querySelectorAll<HTMLElement>('[data-contrast]').forEach((scene) => {
    const veilOff = scene.querySelector<HTMLElement>('[data-veil="sin"]');
    const veilOn = scene.querySelector<HTMLElement>('[data-veil="con"]');
    const panelOn = scene.querySelector<HTMLElement>('[data-panel="con"]');
    const reply = scene.querySelector<HTMLElement>('[data-reply]');
    if (!veilOff || !veilOn || !panelOn) return;

    track(
      gsap.timeline({
        scrollTrigger: {
          trigger: scene,
          start: 'top 78%',
          end: 'bottom 62%',
          scrub: 0.6,
        },
      })
        .to(veilOff, { opacity: 0.62, ease: 'none' }, 0)
        .fromTo(veilOn, { opacity: 0.55 }, { opacity: 0, ease: 'none' }, 0)
        .fromTo(panelOn, { y: 26 }, { y: 0, ease: 'none' }, 0),
    );

    if (reply) {
      reveal(
        reply,
        {
          from: { opacity: 0, y: 16, scale: 0.97, transformOrigin: 'left bottom' },
          to: { opacity: 1, y: 0, scale: 1 },
          duration: 0.55,
          start: 'top 70%',
        },
        reply,
        { ease: 'power2.out' },
      );
    }
  });

  return () => {
    tweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    tweens.length = 0;
  };
}
