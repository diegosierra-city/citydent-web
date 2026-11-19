<?php
/**
 * Endpoint del formulario de contacto de CityDent.
 * Hosting compartido (Spaceship): PHP + mail(), sin Node ni SSH.
 *
 * Ruta pública: /api/contacto.php
 * Espera: POST application/json
 *   { name, clinic, email, phone?, channels?, agendas?, agendasCount?,
 *     software?, message?, founders? }
 * Responde: { ok: boolean, error?: string }
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Preflight (por si el formulario se sirve desde otro origen en desarrollo)
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido']);
    exit;
}

/* ---------------------------------------------------------------- config -- */

const RECIPIENT      = 'hola@citydent.mx';          // cambiar por email real
const FROM_ADDRESS   = 'no-reply@citydent.mx';
const FROM_NAME      = 'CityDent Web';
const RATE_FILE_DIR  = __DIR__ . '/../.rate';        // fuera del docroot idealmente
const MAX_PER_HOUR   = 5;
const MAX_MESSAGE    = 2000;
const MAX_AGENDAS    = 200;
const HONEYPOT_FIELD = 'website';

/** Etiquetas públicas de cada selector: también actúan como lista blanca. */
const CHANNEL_LABELS = [
    'web'         => 'En la web de la clínica',
    'whatsapp'    => 'En WhatsApp',
    'ambos'       => 'En ambos canales',
    'orientacion' => 'Necesita orientación',
];

const AGENDA_LABELS = [
    'no'   => 'No',
    'si'   => 'Sí',
    'nose' => 'No lo sabe',
];

/* --------------------------------------------------------------- helpers -- */

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize(string $value): string
{
    // Elimina bytes de control y recorta; el correo se valida aparte.
    return trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '');
}

/** Deja el valor en una sola línea: imprescindible antes de cualquier cabecera. */
function flat(string $value): string
{
    return str_replace(["\r", "\n", "\t"], ' ', $value);
}

/** Devuelve el valor sólo si es una opción publicada; si no, cadena vacía. */
function oneOf(string $value, array $allowed): string
{
    return array_key_exists($value, $allowed) ? $value : '';
}

/** Anti-flood por IP: contador simple en archivos. */
function throttled(string $ip): bool
{
    if (!is_dir(RATE_FILE_DIR) && !mkdir(RATE_FILE_DIR, 0700, true)) {
        return false; // si no se puede escribir, no bloquear el envío
    }

    $file    = RATE_FILE_DIR . '/' . md5($ip) . '.json';
    $window  = time() - 3600;
    $entries = [];

    if (is_file($file)) {
        $raw     = json_decode((string) file_get_contents($file), true);
        $entries = is_array($raw) ? array_filter($raw, fn($t) => $t > $window) : [];
    }

    if (count($entries) >= MAX_PER_HOUR) {
        return true;
    }

    $entries[] = time();
    file_put_contents($file, json_encode(array_values($entries)), LOCK_EX);

    return false;
}

/* ------------------------------------------------------------------ read -- */

/* Acepta JSON y, como red de seguridad sin JS / sin hidratar, urlencoded. */
$rawInput = file_get_contents('php://input') ?: '';
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

if (str_contains($contentType, 'application/x-www-form-urlencoded')) {
    parse_str($rawInput, $payload);
} else {
    $payload = json_decode($rawInput, true);
}

if (!is_array($payload)) {
    fail(400, 'La solicitud no es un JSON válido.');
}

// Honeypot: un humano nunca ve ni rellena este campo. Responder éxito sin enviar.
if (isset($payload[HONEYPOT_FIELD]) && $payload[HONEYPOT_FIELD] !== '') {
    echo json_encode(['ok' => true]);
    exit;
}

$name    = sanitize((string) ($payload['name'] ?? ''));
$clinic  = sanitize((string) ($payload['clinic'] ?? ''));
$email   = filter_var(
    sanitize((string) ($payload['email'] ?? '')),
    FILTER_VALIDATE_EMAIL
);
$phone   = sanitize((string) ($payload['phone'] ?? ''));
$message = sanitize((string) ($payload['message'] ?? ''));

/* Los selectores sólo aceptan sus valores publicados: nada de texto libre. */
$channel = oneOf((string) ($payload['channels'] ?? ''), CHANNEL_LABELS);
$agenda  = oneOf((string) ($payload['agendas'] ?? ''), AGENDA_LABELS);

$agendasCount = null;
$software     = '';
if ($agenda === 'si') {
    $raw = filter_var($payload['agendasCount'] ?? '', FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1, 'max_range' => MAX_AGENDAS],
    ]);
    $agendasCount = $raw === false ? null : $raw;
    $software     = mb_substr(sanitize((string) ($payload['software'] ?? '')), 0, 120);
}

$founders = filter_var($payload['founders'] ?? false, FILTER_VALIDATE_BOOL);

/* ----------------------------------------------------------- validation -- */

if ($name === '' || mb_strlen($name) < 2 || mb_strlen($name) > 80) {
    fail(422, 'El nombre debe tener entre 2 y 80 caracteres.');
}

if ($clinic === '' || mb_strlen($clinic) < 2 || mb_strlen($clinic) > 120) {
    fail(422, 'El nombre de la clínica debe tener entre 2 y 120 caracteres.');
}

if ($email === false) {
    fail(422, 'El correo electrónico no es válido.');
}

if (mb_strlen($phone) > 40) {
    fail(422, 'El teléfono es demasiado largo.');
}

if (mb_strlen($message) > MAX_MESSAGE) {
    fail(422, sprintf('El mensaje no puede superar los %d caracteres.', MAX_MESSAGE));
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (throttled($ip)) {
    fail(429, 'Has enviado muchos mensajes. Inténtalo más tarde.');
}

/* ------------------------------------------------------------------ send -- */

// Cabeceras: nunca interpolar entrada del usuario en las cabeceras.
$line = static fn(string $label, string $value): string =>
    $label . ': ' . flat($value) . "\r\n";

$body = "Nueva solicitud de propuesta desde la web\r\n\r\n"
      . $line('Nombre', $name)
      . $line('Clínica', $clinic)
      . $line('Correo', (string) $email)
      . ($phone !== '' ? $line('Teléfono', $phone) : '')
      . ($channel !== '' ? $line('Canal deseado', CHANNEL_LABELS[$channel]) : '')
      . ($agenda !== '' ? $line('Conectar agendas', AGENDA_LABELS[$agenda]) : '')
      . ($agendasCount !== null ? $line('Nº aproximado de agendas', (string) $agendasCount) : '')
      . ($software !== '' ? $line('Programa de gestión', $software) : '')
      . $line('Programa Clínicas Fundadoras', $founders ? 'Sí, quiere información' : 'No marcado')
      . "IP: "     . $ip . "\r\n"
      . "Fecha: "  . date('c') . "\r\n";

if ($message !== '') {
    $body .= "\r\nMensaje:\r\n" . $message . "\r\n";
}

$headers = [
    'From: ' . sprintf('%s <%s>', FROM_NAME, FROM_ADDRESS),
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: CityDent-ContactForm',
];

$sent = @mail(RECIPIENT, 'Solicitud de propuesta · ' . flat($clinic), $body, implode("\r\n", $headers));

if (!$sent) {
    fail(502, 'No pudimos entregar el mensaje. Escríbenos directamente a ' . RECIPIENT);
}

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
