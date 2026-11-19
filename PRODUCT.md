# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** titulares y responsables de clínicas dentales en España. Quieren mejorar la atención al paciente sin añadir complejidad ni comprometer su reputación. Evalúan un servicio para su clínica, no atención odontológica para ellos.
- **Secondary (influye en la compra):** gerencia y coordinación (necesitan entender alcance, coste, puesta en marcha y compatibilidad con su operativa) y recepción (necesita apoyo, no otra carga ni una amenaza a su puesto).
- **Visitante de la demo:** experimenta el producto desde el punto de vista del *paciente* de una clínica ficticia. Esta voz debe distinguirse claramente de la voz comercial dirigida a la clínica.

## Product Purpose

CityDent es un asistente de IA para clínicas dentales. Responde a las preguntas habituales de la clínica (horarios, ubicación, servicios, cómo pedir cita) con la información que la propia clínica facilita, y guía al paciente hacia el siguiente paso: con agenda conectada, consulta las horas libres y deja una propuesta que el paciente confirma con un botón; sin ella, entrega el enlace de reservas configurado. En WhatsApp informa, pero no reserva. Su propósito comercial es que el equipo humano recupere tiempo para la atención personal. Éxito = la clínica entiende qué hace, lo prueba en la demo y solicita una propuesta.

## Positioning

«CityDent es el asistente de IA para clínicas dentales que responde con la información de tu clínica y guía a tus pacientes, para que tu equipo pueda centrarse en la atención personal.» La idea que ordena todo: **lo más importante son tus pacientes; la tecnología debe ayudarte a estar más presente para ellos.** No es un robot que sustituye a recepción ni una herramienta de decisión clínica.

## Operating Context

- Secuencia persuasiva de la landing: me reconoce → entiendo cómo ayuda → lo pruebo → comprendo sus límites → conozco el coste → solicito una propuesta.
- Acciones: principal = probar CityDent en la propia página (#demo); comercial = solicitar propuesta (#contacto); apoyo = consultar módulos/alcance/precios (#precios).
- La demo debe ser interactiva y sin formulario previo; el CTA del hero abre la misma experiencia que #demo (un único asistente, no dos flotantes).
- Hosting compartido (Spaceship) sin SSH; build estático de Astro + islas Svelte; backend de contacto en PHP.

## Capabilities and Constraints

Confirmado (base encontrada en código/documentación, no certificación de producción):
- Base conversacional configurable + conocimiento por asistente (instrucciones, contexto, FAQ, documentos).
- Widget web conectado a la API (condicionado a configuración) y transporte de texto por WhatsApp (ventana de atención; sin mensajería proactiva acreditada).
- Citas, modalidad **enlace**: orientación y entrega de un enlace de reservas. Decir «facilita el acceso a la reserva», no «confirma/cancela/reorganiza citas».
- Citas, modalidad **agenda conectada** (acreditada el 2026-10-15 y medida en vivo el 2026-10-21): consulta las horas libres de la agenda del negocio y deja una propuesta que **el visitante confirma con un botón**; el modelo nunca escribe en la agenda. Solo funciona en el widget web. Prohibido anunciar: cancelar o reasignar citas desde el chat, reservar por WhatsApp, más de un profesional por agente.
- Intervención humana: indica cómo contactar con el equipo (relevo integrado no acreditado de extremo a extremo).

### Acreditado con evidencia

Las rutas son del repositorio hermano `../CityCiudad-app`. Verificado en vivo el 2026-10-21 sobre el agente de demo «Asistente IA» (cliente *Odontología Sonrisa Plena*, `widget_public_id = 1c7c86371b0c40a5abd20c23f057906e`): reserva real escrita en Easy!Appointments, `appointment_id 409770be-e261-4a00-b3bf-c97dca15a22b`, `external_id 3`, hora 2026-10-24 10:30 `Europe/Madrid` (`08:30Z`), duración y precio leídos del catálogo conectado.

| Afirmación publicable | Evidencia |
|---|---|
| Lee la disponibilidad real de la agenda conectada: un día por llamada, hasta 12 horas, en la zona horaria de la clínica y descontando las citas ya cogidas | `apps/api/src/services/bookingTools.ts:294-343`; `docs/guia-de-uso.md:265-269` |
| Pide solo nombre, correo y la hora elegida, relee la agenda y deja una propuesta idempotente con 30 minutos de caducidad; no pide ni almacena datos clínicos | `bookingTools.ts:345-452` (campos en `:355-358`) |
| La escritura en la agenda la dispara el botón del visitante, nunca el modelo | `apps/api/src/routes/widget.ts:446-451`; ejecución en `apps/api/src/services/appointmentExecution.ts:220-363` |
| Si la agenda no responde, dice que no puede comprobar las horas en vez de inventarlas | `docs/guia-de-uso.md:267,297` |
| Si un módulo deja de estar *Listo*, deja de sumar días facturables | tabla `agent_module_ready_days` (muestreo cada 15 min); `docs/guia-de-uso.md:297,550` |

No acreditado / NO anunciar como disponible (lo que sí lo está, con su evidencia, está en el bloque anterior):
- Gestión multiagenda operativa (modelo comercial por agendas es propuesta, no cobrar/anunciar sin validar).
- Cambiar o cancelar citas desde el chat: lo hace la clínica en su Easy!Appointments (`docs/guia-de-uso.md:311-318`).
- Reservar por WhatsApp: el bucle de herramientas solo existe en la ruta del widget (`routes/widget.ts:365-372`); `apps/api/src/routes/inbound.ts:12` llama a `chatCompletion` sin herramientas.
- Recordatorios ejecutables e informes de ahorro/conversión.
- Diagnóstico, valoración de síntomas, interpretación de radiografías, recomendación de tratamientos.
- Sellos o garantías generales de cumplimiento («RGPD garantizado», «HIPAA», «certificado AEPD», «servidores en España»).
- Cifras de precisión, ahorro, ausencias o plazos («99.4%», «70%», «24/7», «listo en una tarde»).
- Integraciones de agenda distintas de Easy!Appointments (`apps/api/src/db/schema.ts:541`): ni Google Calendar, ni Calendly, ni Cal.com, ni Clinic Cloud, Gesden, Dentasys o Dentidesk.

Pendiente de decisión comercial (no inventar): tarifas, módulos, unidad de agenda, coste de implementación, hito del 50% restante, inicio de la mensualidad, impuestos, permanencia/cancelación, soporte/mantenimiento. La unidad comercial «agenda» sigue sin definir: hoy el límite técnico es **un profesional por agente**, así que no se puede cobrar ni anunciar «agendas» sin cerrar antes qué cuenta como una.

Terminología (es-ES, trato de «tú»): «clínica dental», «pedir cita», «recepción», «presupuesto», «cuota mensual», «IVA». Evitar «consultorio», «agendar», «revolucionario», «infalible» y jerga técnica innecesaria.

## Brand Commitments

- Nombre: **CityDent**. Logotipo y marca gráfica en `docs/logo/` (burbuja de chat con diente + wordmark geométrico tipo Futura).
- Colores de marca derivados del logo: navy `#0C2641`, azul `#1D91E4`, turquesa `#26BDC6`, degradado burbuja `#5AAEE0`→`#38C3C4`, gris `#494D56`.
- Tono: profesional, cercano y concreto.
- Dirección visual fijada por el brief: continuidad tipo LUCENT — apertura inmersiva, protagonismo de la imagen, aparición progresiva del mensaje; un mensaje principal por escena; el scroll no bloquea demo/precios/contacto; sin sonido automático.

## Evidence on Hand

- Brief de contenido autoritativo: `docs/propuesta-contenido-citydent.md` (fuente de todo el copy publicable y de las notas internas de honestidad).
- Visuales reales: `docs/imagenes/01.jpg` (hero, profesional desde la perspectiva del paciente), `docs/imagenes/02.jpg` (plano abierto de clínica), `docs/videos/06.mp4` (apertura con zoom-out del gabinete) y `docs/videos/08.mp4` (pie, máster corregido sin el salto del último fotograma). Los personajes son ficticios, con rostros generados por IA: confirmadas las condiciones de uso, el material puede publicarse sin créditos de atribución.
- Logo/icono: `docs/logo/citydent-logo.svg`, `docs/logo/Icon.png`.
- Demo interactiva existente (widget) integrada vía `src/components/ChatDock.astro`.
- **Ausencias que NO deben fabricarse:** casos de éxito, testimonios, clientes, puntuaciones, benchmarks, precios concretos, certificaciones, identidad legal/domicilio reales (pendientes), imagen de tres profesionales (pendiente).

## Product Principles

1. Vender solo lo que se puede demostrar; lo no validado se presenta como propuesta o se omite.
2. La atención personal por delante: la tecnología apoya, no sustituye el criterio clínico ni el trato humano.
3. Claridad y transparencia (alcance, límites y precio por separado) como ventaja competitiva frente al hype.
4. Probar antes de prometer: la demo interactiva sustituye a las afirmaciones comerciales.
5. Honestidad de identidad: el asistente se declara IA desde el inicio y la demo usa una clínica ficticia.

## Accessibility & Inclusion

- Navegación por teclado, foco visible, contraste suficiente, encabezados ordenados, formulario con etiquetas persistentes.
- Contenido esencial visible sin JS y con movimiento reducido (fotogramas/transiciones mínimas); texto HTML legible con imágenes de sustitución.
- El contenido esencial no debe desaparecer al hacer zoom; diseño móvil con recortes que no eliminen rostros.
