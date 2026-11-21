<script>
  /**
   * ContactForm — solicitud de propuesta (§3.13 de la propuesta aprobada).
   *
   * Envia JSON al endpoint público de la API (POST /web/contacto), que guarda
   * la solicitud y avisa por correo. Incluye honeypot anti-spam y validación
   * con zod en cliente; el servidor revalida siempre (nunca confiar en el cliente).
   *
   * En error se conserva todo lo escrito: el visitante no repite el formulario.
   */
  import { z } from 'zod';
  import { tick } from 'svelte';
  import { scrollToTarget } from '../lib/scroll';

  const CONTACT_ENDPOINT =
    import.meta.env.PUBLIC_CONTACT_ENDPOINT ?? 'https://api.citydent.app/web/contacto';

  const CHANNELS = [
    { value: 'web', label: 'En la web de mi clínica' },
    { value: 'whatsapp', label: 'En WhatsApp' },
    { value: 'ambos', label: 'En ambos canales' },
    { value: 'orientacion', label: 'Necesito orientación' },
  ];

  const AGENDAS = [
    { value: 'no', label: 'No' },
    { value: 'si', label: 'Sí' },
    { value: 'nose', label: 'No lo sé' },
  ];

  const contactSchema = z.object({
    name: z
      .string()
      .min(2, 'El nombre debe tener al menos 2 caracteres.')
      .max(80, 'El nombre es demasiado largo.'),
    clinic: z
      .string()
      .min(2, 'Indica el nombre de tu clínica.')
      .max(120, 'El nombre de la clínica es demasiado largo.'),
    email: z
      .string()
      .min(1, 'El correo profesional es obligatorio.')
      .email('Correo no válido.'),
    phone: z.string().max(40, 'El teléfono es demasiado largo.'),
    message: z.string().max(2000, 'El mensaje es demasiado largo.'),
  });

  const STATUS = {
    IDLE: 'idle',
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error',
  };

  let name = $state('');
  let clinic = $state('');
  let email = $state('');
  let phone = $state('');
  let channels = $state('');
  let agendas = $state('');
  let agendasCount = $state('');
  let software = $state('');
  let founders = $state(false);
  let message = $state('');
  let honeypot = $state(''); // debe quedar vacío: lo rellenan los bots

  let status = $state(STATUS.IDLE);
  let formError = $state('');
  let fieldErrors = $state({});
  let successPanel = $state(null);
  let feedbackPanel = $state(null);

  /* El panel de éxito sustituye a un formulario mucho más alto: sin este
     scroll quedaría por encima del viewport tras el envío. */
  async function showSuccess() {
    status = STATUS.SUCCESS;
    await tick();
    if (!successPanel) return;
    scrollToTarget(successPanel);
    successPanel.focus({ preventScroll: true });
  }

  /* El aviso de error queda junto al botón de envío, fuera de pantalla si el
     formulario es más alto que el viewport: hay que traerlo a la vista. */
  async function showError() {
    await tick();
    if (!feedbackPanel) return;
    const rect = feedbackPanel.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 12 || rect.top < 88) {
      scrollToTarget(feedbackPanel, 120);
    }
  }

  const isLoading = $derived(status === STATUS.LOADING);
  const wantsAgendas = $derived(agendas === 'si');

  const fieldClass =
    'w-full rounded-[0.9rem] border bg-white px-4 py-3 text-base text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-mist/55 focus:outline-none';
  const fieldOk = 'border-ink/20 focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(29,145,228,0.22)]';
  const fieldBad = 'border-red-500/70 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.18)]';
  const labelClass = 'mb-2 block text-sm font-semibold text-ink';
  const hintClass = 'mt-2 text-xs leading-relaxed text-mist';

  /* Opciones tipo chip: el input va sr-only, así que el foco se pinta en la etiqueta. */
  const chipClass =
    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-2';
  const chipOn = 'border-brand-blue bg-brand-blue/10 text-brand-deep';
  const chipOff = 'border-ink/20 text-ink hover:border-brand-blue/60';

  function validate() {
    const parsed = contactSchema.safeParse({ name, clinic, email, phone, message });
    if (parsed.success) {
      fieldErrors = {};
      formError = '';
      return true;
    }

    const next = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!next[key]) next[key] = issue.message;
    }
    fieldErrors = next;
    return false;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Honeypot: si viene relleno, fingir éxito y no enviar nada.
    if (honeypot !== '') {
      await showSuccess();
      return;
    }

    if (!validate()) return;

    status = STATUS.LOADING;
    formError = '';

    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          clinic,
          email,
          phone,
          channels,
          agendas,
          agendasCount: wantsAgendas ? agendasCount : '',
          software: wantsAgendas ? software : '',
          founders,
          message,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        name = clinic = email = phone = channels = agendas = agendasCount = software = message = '';
        founders = false;
        await showSuccess();
      } else {
        status = STATUS.ERROR;
        formError =
          data?.error ??
          'No se ha podido enviar la solicitud. Inténtalo de nuevo; la información que has escrito se mantiene en el formulario.';
        await showError();
      }
    } catch {
      status = STATUS.ERROR;
      formError =
        'No se ha podido enviar la solicitud. Inténtalo de nuevo; la información que has escrito se mantiene en el formulario.';
      await showError();
    }
  }
</script>

{#if status === STATUS.SUCCESS}
  <div
    bind:this={successPanel}
    tabindex="-1"
    class="rounded-[1.5rem] border border-brand-teal/40 bg-white p-7 text-center shadow-[0_30px_80px_-50px_rgba(12,38,65,0.7)] focus:outline-none md:p-10"
    role="status"
    aria-live="polite"
  >
    <span
      class="mx-auto flex h-12 w-12 items-center justify-center rounded-full gradient-cta text-white"
      aria-hidden="true"
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" />
      </svg>
    </span>
    <h3 class="mt-5 font-display text-2xl font-semibold text-ink">
      Hemos recibido tu solicitud
    </h3>
    <p class="mx-auto mt-3 max-w-md text-base leading-relaxed text-mist">
      Nuestro equipo se pondrá en contacto contigo para revisar las
      necesidades de tu clínica.
    </p>
    <button
      class="mt-6 text-sm font-semibold text-brand-deep underline decoration-brand-deep/40 underline-offset-4 hover:text-ink"
      onclick={() => (status = STATUS.IDLE)}
      type="button"
    >
      Enviar otra solicitud
    </button>
  </div>
{:else}
  <form
    class="rounded-[1.5rem] border border-ink/12 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(12,38,65,0.7)] md:p-9"
    method="post"
    action={CONTACT_ENDPOINT}
    onsubmit={handleSubmit}
    novalidate
    aria-describedby="form-feedback"
  >
    <!-- Honeypot accesible: oculto visual y semánticamente -->
    <div class="hidden" aria-hidden="true">
      <label for="c-website">No llenar este campo</label>
      <input
        type="text"
        id="c-website"
        name="website"
        tabindex="-1"
        autocomplete="off"
        bind:value={honeypot}
      />
    </div>

    <h3 class="font-display text-2xl font-semibold text-ink">Cuéntanos qué necesitas</h3>
    <p class="mt-3 mb-7 text-sm leading-relaxed text-mist">Sin compromiso ni cobros. Los campos con * son obligatorios; el resto nos ayuda a preparar tu propuesta.</p>

    <div class="grid gap-5 sm:grid-cols-2">
      <div>
        <label for="c-name" class={labelClass}>
          Nombre <span class="text-brand-deep">*</span>
        </label>
        <input
          type="text"
          id="c-name"
          name="name"
          required
          autocomplete="name"
          placeholder="María López"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? 'err-name' : undefined}
          class="{fieldClass} {fieldErrors.name ? fieldBad : fieldOk}"
          bind:value={name}
        />
        {#if fieldErrors.name}
          <p id="err-name" class="mt-2 text-sm text-red-700">{fieldErrors.name}</p>
        {/if}
      </div>

      <div>
        <label for="c-clinic" class={labelClass}>
          Nombre de la clínica <span class="text-brand-deep">*</span>
        </label>
        <input
          type="text"
          id="c-clinic"
          name="clinic"
          required
          autocomplete="organization"
          placeholder="Clínica Dental López"
          aria-invalid={Boolean(fieldErrors.clinic)}
          aria-describedby={fieldErrors.clinic ? 'err-clinic' : undefined}
          class="{fieldClass} {fieldErrors.clinic ? fieldBad : fieldOk}"
          bind:value={clinic}
        />
        {#if fieldErrors.clinic}
          <p id="err-clinic" class="mt-2 text-sm text-red-700">{fieldErrors.clinic}</p>
        {/if}
      </div>

      <div>
        <label for="c-email" class={labelClass}>
          Correo profesional <span class="text-brand-deep">*</span>
        </label>
        <input
          type="email"
          id="c-email"
          name="email"
          required
          autocomplete="email"
          placeholder="maria@tuclinica.es"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'err-email' : undefined}
          class="{fieldClass} {fieldErrors.email ? fieldBad : fieldOk}"
          bind:value={email}
        />
        {#if fieldErrors.email}
          <p id="err-email" class="mt-2 text-sm text-red-700">{fieldErrors.email}</p>
        {/if}
      </div>

      <div>
        <label for="c-phone" class={labelClass}>Teléfono <span class="font-normal text-mist">(opcional)</span></label>
        <input
          type="tel"
          id="c-phone"
          name="phone"
          autocomplete="tel"
          placeholder="+34 600 000 000"
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={fieldErrors.phone ? 'err-phone' : 'hint-phone'}
          class="{fieldClass} {fieldErrors.phone ? fieldBad : fieldOk}"
          bind:value={phone}
        />
        {#if fieldErrors.phone}
          <p id="err-phone" class="mt-2 text-sm text-red-700">{fieldErrors.phone}</p>
        {:else}
          <p id="hint-phone" class={hintClass}>Con prefijo internacional.</p>
        {/if}
      </div>
    </div>

    <fieldset class="mt-7">
      <legend class={labelClass}>¿Dónde quieres usarlo? <span class="font-normal text-mist">(opcional)</span></legend>
      <div class="flex flex-wrap gap-2">
        {#each CHANNELS as channel}
          <label
            class="{chipClass} {channels === channel.value ? chipOn : chipOff}"
          >
            <input
              type="radio"
              name="channels"
              value={channel.value}
              class="sr-only"
              bind:group={channels}
            />
            {channel.label}
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="mt-7">
      <legend class={labelClass}>¿Quieres añadir el calendario de citas? <span class="font-normal text-mist">(opcional)</span></legend>
      <div class="flex flex-wrap gap-2">
        {#each AGENDAS as option}
          <label class="{chipClass} {agendas === option.value ? chipOn : chipOff}">
            <input type="radio" name="agendas" value={option.value} class="sr-only" bind:group={agendas} />
            {option.label}
          </label>
        {/each}
      </div>
      <p class={hintClass}>
        Configuramos un calendario para tu clínica. Si ya usas un programa de
        gestión, revisamos cómo trabajar con ambos; no se sincronizan automáticamente.
      </p>
    </fieldset>

    {#if wantsAgendas}
      <div class="mt-5 grid gap-5 rounded-[1rem] bg-ink/[0.03] p-5 sm:grid-cols-2">
        <div>
          <label for="c-agendas-count" class={labelClass}>Número de profesionales con agenda</label>
          <input
            type="number"
            id="c-agendas-count"
            name="agendasCount"
            min="1"
            max="200"
            step="1"
            placeholder="3"
            class="{fieldClass} {fieldOk}"
            bind:value={agendasCount}
          />
        </div>
        <div>
          <label for="c-software" class={labelClass}>Programa de gestión que usas</label>
          <input
            type="text"
            id="c-software"
            name="software"
            maxlength="120"
            placeholder="Nombre del programa"
            class="{fieldClass} {fieldOk}"
            bind:value={software}
          />
        </div>
      </div>
    {/if}

    <div class="mt-7">
      <label for="c-message" class={labelClass}>
        ¿Qué te gustaría mejorar en la atención? <span class="font-normal text-mist">(opcional)</span>
      </label>
      <textarea
        id="c-message"
        name="message"
        rows="4"
        maxlength="2000"
        placeholder="Cuéntanos qué consultas se repiten más en tu clínica…"
        aria-invalid={Boolean(fieldErrors.message)}
        aria-describedby={fieldErrors.message ? 'err-message' : undefined}
        class="{fieldClass} resize-none {fieldErrors.message ? fieldBad : fieldOk}"
        bind:value={message}
      ></textarea>
      <div class="mt-2 flex items-start justify-between gap-4">
        {#if fieldErrors.message}
          <p id="err-message" class="text-sm text-red-700">{fieldErrors.message}</p>
        {:else}
          <span></span>
        {/if}
        <span class="shrink-0 text-xs text-mist tabular-nums">{message.length} / 2000</span>
      </div>
    </div>

    <label
      class="mt-7 flex cursor-pointer items-start gap-3 rounded-[1rem] border border-ink/12 bg-ink/[0.03] p-4 transition-colors duration-150 has-[:checked]:border-brand-blue/50 has-[:checked]:bg-brand-blue/[0.06] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-2"
    >
      <input
        type="checkbox"
        name="founders"
        class="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue"
        bind:checked={founders}
      />
      <span class="text-sm leading-relaxed text-ink">
        Quiero información del <strong class="font-semibold">Programa Clínicas Fundadoras</strong>:
        plaza prioritaria en la próxima incorporación y condiciones de fundador durante el primer periodo.
      </span>
    </label>

    <div
      id="form-feedback"
      bind:this={feedbackPanel}
      aria-live="polite"
      class:visible={status === STATUS.ERROR}
      class:invisible={status !== STATUS.ERROR}
    >
      {#if status === STATUS.ERROR}
        <div class="mt-6 rounded-[1rem] border border-red-300 bg-red-50 p-4 text-sm leading-relaxed text-red-900" role="alert">
          {formError}
        </div>
      {/if}
    </div>

    <button
      type="submit"
      disabled={isLoading}
      class="gradient-cta mt-7 w-full rounded-full px-8 py-4 font-semibold text-white shadow-lg shadow-brand-blue/25 transition-transform duration-150 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {#if isLoading}
        <span class="inline-flex items-center justify-center gap-2">
          <span
            class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"></span>
          Enviando tu solicitud…
        </span>
      {:else}
        Solicitar propuesta
      {/if}
    </button>

    <p class="mt-4 text-center text-xs leading-relaxed text-mist">
      Utilizaremos tus datos para responder a esta solicitud, según la
      <a href="/legal/privacidad" class="underline underline-offset-2 hover:text-brand-deep">Política de privacidad</a>.
      No incluyas información de pacientes. Dudas:
      <a href="mailto:soporte@citydent.app" class="underline underline-offset-2 hover:text-brand-deep">soporte@citydent.app</a>.
    </p>
  </form>
{/if}
