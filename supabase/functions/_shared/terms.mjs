// Versioned Terms and Conditions: the ONE source for the booking modal, the backend validation and the confirmation email.
// Plain JS (like google-calendar.mjs) so Deno (Edge Functions), Node (tests) and Vite/TypeScript (src/) all import the same file.
//
// A published version is IMMUTABLE: bookings store the version the customer accepted and the email prints exactly that text. To change
// the policies, add a NEW version (v2...) and move CURRENT_TERMS_VERSION; never edit a published one (tests/terms.test.mjs pins v1).
// The commercial wording below is the client's own document — do not reword, merge or "fix" it.

const section = (id, title, items) => Object.freeze({ id, title: Object.freeze(title), items: Object.freeze(items.map((item) => Object.freeze(item))) });

const V1 = Object.freeze({
  version: 'v1',
  sections: Object.freeze([
    section('reservations-payments', { en: 'Reservations and Payments', es: 'Reservas y pagos' }, [
      { en: 'Bank transfer/PayPal fees will be covered by the client.', es: 'Las comisiones de transferencia bancaria o PayPal serán cubiertas por el cliente.' },
    ]),
    section('change-cancellation', { en: 'Change and Cancellation Policies', es: 'Políticas de cambios y cancelaciones' }, [
      { en: 'Cancellations 3 days before the tour date: You may cancel your tour without penalty up to 3 days before the tour and receive a 100% refund.', es: 'Cancelaciones 3 días antes de la fecha del tour: el cliente puede cancelar sin penalización hasta 3 días antes del tour y recibir un reembolso del 100%.' },
      { en: 'Cancellations within 3 days of the tour date: A 30% penalty will apply due to operational losses/boat rental costs.', es: 'Cancelaciones dentro de los 3 días de la fecha del tour: se aplicará una penalización del 30% debido a pérdidas operativas y costos de alquiler de embarcación.' },
      { en: 'Rescheduling within 3 days of the tour: You may reschedule your tour to a different available date, subject to availability.', es: 'Reprogramación dentro de los 3 días del tour: el cliente puede reprogramar el tour para otra fecha disponible, sujeto a disponibilidad.' },
      { en: 'Cancellations with full penalty: If you cancel within 24 hours of the tour, a 100% penalty will apply due to operational/boat rental costs, food, and beverage services.', es: 'Cancelaciones con penalización total: si el cliente cancela dentro de las 24 horas anteriores al tour, se aplicará una penalización del 100% debido a costos operativos, alquiler de embarcación, alimentos y bebidas.' },
      { en: 'If the client or their companions fail to show up for the tour, the deposit will not be refunded.', es: 'Si el cliente o sus acompañantes no se presentan al tour, el depósito no será reembolsado.' },
    ]),
    section('weather', { en: 'Weather-related Cancellation Policies', es: 'Políticas de cancelación por clima' }, [
      { en: 'A refund or rescheduling will be offered only when weather conditions are beyond human control, such as hurricanes, forecasts of strong waves, high winds, or heavy rain within 24 hours prior to the tour.', es: 'Se ofrecerá reembolso o reprogramación únicamente cuando las condiciones climáticas estén fuera del control humano, como huracanes, pronósticos de fuerte oleaje, vientos intensos o lluvia fuerte dentro de las 24 horas previas al tour.' },
      { en: 'In cases of non-adverse weather conditions, such as cloudy or low-sun days, no refund or rescheduling will be granted.', es: 'En condiciones meteorológicas no adversas, como días nublados o con poco sol, no se otorgará reembolso ni reprogramación.' },
    ]),
    section('arrival', { en: 'Arrival and Punctuality', es: 'Llegada y puntualidad' }, [
      { en: 'We recommend arriving at the departure point at least 15 minutes before the scheduled time.', es: 'Se recomienda llegar al punto de salida al menos 15 minutos antes de la hora programada.' },
      { en: "The time shown on your reservation is the tour's departure time.", es: 'La hora indicada en la reserva corresponde a la hora de salida del tour.' },
      { en: 'Please allow enough time to arrive, park, and prepare to board.', es: 'El cliente debe considerar el tiempo necesario para llegar, estacionar y prepararse para abordar.' },
      { en: 'Late arrivals may affect the duration of the tour and do not guarantee an extension of the originally reserved time.', es: 'Los retrasos del cliente pueden afectar la duración del tour y no garantizan una extensión del horario originalmente reservado.' },
    ]),
    section('responsibilities', { en: 'Customer Responsibilities', es: 'Responsabilidad del cliente' }, [
      { en: 'The client must follow the safety instructions provided by the crew throughout the activity.', es: 'El cliente debe seguir las indicaciones de seguridad proporcionadas por la tripulación durante toda la actividad.' },
      { en: 'Papagayo Fishing Tours may modify or interrupt an activity for safety reasons, adverse sea conditions, or circumstances beyond its control.', es: 'Papagayo Fishing Tours podrá modificar o interrumpir una actividad cuando existan razones de seguridad, condiciones marítimas adversas o circunstancias fuera de su control.' },
    ]),
    section('privacy', { en: 'Privacy and Use of Personal Data', es: 'Privacidad y uso de datos personales' }, [
      { en: 'Personal information provided during the booking process, such as your name, email address, phone or WhatsApp number, booking details, and special requests, will be used only to manage your reservation, coordinate the tour, send confirmations, respond to customer requests, and provide the booked service.', es: 'Los datos personales proporcionados durante el proceso de reserva, como nombre, correo electrónico, número de teléfono o WhatsApp, información de la reserva y solicitudes especiales, serán utilizados únicamente para gestionar la reserva, coordinar el tour, enviar confirmaciones, atender solicitudes del cliente y brindar el servicio contratado.' },
      { en: 'Information may be processed through technology providers required to operate the service, including booking, payment, email, calendar, and data storage platforms.', es: 'La información podrá ser procesada mediante proveedores tecnológicos necesarios para el funcionamiento del servicio, incluyendo plataformas de reservas, pagos, correo electrónico, calendario y almacenamiento de datos.' },
      { en: 'Papagayo Fishing Tours will not use your personal information for purposes unrelated to providing the service without your authorization, except where necessary to comply with legal or administrative obligations.', es: 'Papagayo Fishing Tours no utilizará los datos personales del cliente para fines distintos a la prestación del servicio sin su autorización, salvo cuando sea necesario para cumplir obligaciones legales o administrativas.' },
      { en: 'Personal information will not be sold to third parties for advertising or commercial purposes.', es: 'Los datos personales no serán vendidos a terceros con fines publicitarios o comerciales.' },
      { en: 'You are responsible for providing accurate and up-to-date information when making a reservation.', es: 'El cliente es responsable de proporcionar información correcta y actualizada al realizar la reserva.' },
      { en: 'You may request correction or deletion of your personal information when applicable, subject to any information that must be retained for legal, administrative, or booking-related purposes.', es: 'El cliente puede solicitar la corrección o eliminación de sus datos personales cuando corresponda, sujeto a cualquier información que deba conservarse por razones legales, administrativas o relacionadas con la reserva.' },
      { en: 'Special requests submitted during the booking process should be limited to information necessary to properly prepare or provide the service.', es: 'Las solicitudes especiales ingresadas durante la reserva deben limitarse a información necesaria para preparar o brindar adecuadamente el servicio.' },
    ]),
  ]),
});

export const TERMS_VERSIONS = Object.freeze({ v1: V1 });
export const CURRENT_TERMS_VERSION = 'v1';
export const TERMS_LANGUAGES = Object.freeze(['en', 'es']);

export const isKnownTermsVersion = (version, registry = TERMS_VERSIONS) => typeof version === 'string' && Object.prototype.hasOwnProperty.call(registry, version);

/**
 * ROLLOUT SWITCH. While true, a request that carries NO terms fields at all (a client that predates the checkbox: an open tab, the old site)
 * is still accepted and stored as "no acceptance" — acceptance is never invented for it. It only has to stay true from the backend deploy
 * until the new frontend is live; migration 202610080002 then makes acceptance mandatory in the database for every creation path, after which
 * this can be set to false (or removed) in a later cleanup. It never relaxes anything else: an explicit `false`, a bad version or an
 * incoherent payload are rejected regardless.
 */
export const ALLOW_LEGACY_CLIENTS_WITHOUT_TERMS = true;

/**
 * Backend gate for a booking's terms acceptance (the Edge Functions call it BEFORE touching the database; the database re-checks it).
 * Returns { ok: true, termsVersion } (accepted), { ok: true, legacy: true } (no terms fields, only while the rollout switch is on) or
 * { ok: false, status, code } with code in TERMS_NOT_ACCEPTED | TERMS_VERSION_UNKNOWN | TERMS_VERSION_OUTDATED.
 * A new booking must accept the CURRENT version: an older published version is still valid for historical bookings but not for new ones.
 */
export function checkTermsAcceptance({ termsAccepted, termsVersion }, { allowLegacy = ALLOW_LEGACY_CLIENTS_WITHOUT_TERMS } = {}) {
  if (allowLegacy && termsAccepted === undefined && termsVersion === undefined) return { ok: true, legacy: true };
  if (termsAccepted !== true) return { ok: false, status: 400, code: 'TERMS_NOT_ACCEPTED' };
  if (!isKnownTermsVersion(termsVersion)) return { ok: false, status: 400, code: 'TERMS_VERSION_UNKNOWN' };
  if (termsVersion !== CURRENT_TERMS_VERSION) return { ok: false, status: 409, code: 'TERMS_VERSION_OUTDATED' };
  return { ok: true, termsVersion };
}

/**
 * The text of ONE version in ONE language. Throws on an unknown version/language: it never falls back to the current version.
 * `registry` exists so tests can prove a v1 booking keeps v1 once a v2 is published; production code never passes it.
 */
export function getTerms(version, language, registry = TERMS_VERSIONS) {
  if (!isKnownTermsVersion(version, registry)) throw new Error(`Unknown terms version: ${String(version)}`);
  if (!TERMS_LANGUAGES.includes(language)) throw new Error(`Unsupported terms language: ${String(language)}`);
  return {
    version,
    language,
    sections: registry[version].sections.map((entry) => ({ id: entry.id, title: entry.title[language], items: entry.items.map((item) => item[language]) })),
  };
}

/** Plain-text rendering (email text part). */
export function renderTermsText(version, language, registry = TERMS_VERSIONS) {
  const terms = getTerms(version, language, registry);
  const heading = language === 'es' ? 'Términos y Condiciones' : 'Terms and Conditions';
  // The version is internal metadata (persistence, audit, which text to print): it is never shown to the customer.
  return [heading, ...terms.sections.map((entry) => `\n${entry.title}\n${entry.items.map((item) => `- ${item}`).join('\n')}`)].join('\n');
}
