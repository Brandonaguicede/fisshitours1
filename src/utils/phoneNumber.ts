// International phone capture. Nothing here ever guesses a country: the number is built from the prefix the customer chose in the
// selector (Costa Rica is only the INITIAL value, always changeable) or from an explicit "+" / "00" the customer typed. The result is
// E.164 ("+50688881234"), the exact value that is stored and that wa.me uses. Pure helpers, no imports.

export interface PhoneCountry {
  iso: string;
  /** Calling code without "+". */
  dialCode: string;
  es: string;
  en: string;
}

export const DEFAULT_PHONE_COUNTRY = 'CR';

// A compact list (no dependency): Costa Rica and the main tourist origins. A visitor from elsewhere can always type "+<code> ..." in the number field.
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'CR', dialCode: '506', es: 'Costa Rica', en: 'Costa Rica' },
  { iso: 'US', dialCode: '1', es: 'Estados Unidos', en: 'United States' },
  { iso: 'CA', dialCode: '1', es: 'Canadá', en: 'Canada' },
  { iso: 'MX', dialCode: '52', es: 'México', en: 'Mexico' },
  { iso: 'PA', dialCode: '507', es: 'Panamá', en: 'Panama' },
  { iso: 'NI', dialCode: '505', es: 'Nicaragua', en: 'Nicaragua' },
  { iso: 'HN', dialCode: '504', es: 'Honduras', en: 'Honduras' },
  { iso: 'SV', dialCode: '503', es: 'El Salvador', en: 'El Salvador' },
  { iso: 'GT', dialCode: '502', es: 'Guatemala', en: 'Guatemala' },
  { iso: 'BZ', dialCode: '501', es: 'Belice', en: 'Belize' },
  { iso: 'DO', dialCode: '1', es: 'República Dominicana', en: 'Dominican Republic' },
  { iso: 'PR', dialCode: '1', es: 'Puerto Rico', en: 'Puerto Rico' },
  { iso: 'CO', dialCode: '57', es: 'Colombia', en: 'Colombia' },
  { iso: 'VE', dialCode: '58', es: 'Venezuela', en: 'Venezuela' },
  { iso: 'EC', dialCode: '593', es: 'Ecuador', en: 'Ecuador' },
  { iso: 'PE', dialCode: '51', es: 'Perú', en: 'Peru' },
  { iso: 'BO', dialCode: '591', es: 'Bolivia', en: 'Bolivia' },
  { iso: 'BR', dialCode: '55', es: 'Brasil', en: 'Brazil' },
  { iso: 'AR', dialCode: '54', es: 'Argentina', en: 'Argentina' },
  { iso: 'CL', dialCode: '56', es: 'Chile', en: 'Chile' },
  { iso: 'UY', dialCode: '598', es: 'Uruguay', en: 'Uruguay' },
  { iso: 'PY', dialCode: '595', es: 'Paraguay', en: 'Paraguay' },
  { iso: 'ES', dialCode: '34', es: 'España', en: 'Spain' },
  { iso: 'FR', dialCode: '33', es: 'Francia', en: 'France' },
  { iso: 'DE', dialCode: '49', es: 'Alemania', en: 'Germany' },
  { iso: 'IT', dialCode: '39', es: 'Italia', en: 'Italy' },
  { iso: 'GB', dialCode: '44', es: 'Reino Unido', en: 'United Kingdom' },
  { iso: 'IE', dialCode: '353', es: 'Irlanda', en: 'Ireland' },
  { iso: 'NL', dialCode: '31', es: 'Países Bajos', en: 'Netherlands' },
  { iso: 'BE', dialCode: '32', es: 'Bélgica', en: 'Belgium' },
  { iso: 'CH', dialCode: '41', es: 'Suiza', en: 'Switzerland' },
  { iso: 'AT', dialCode: '43', es: 'Austria', en: 'Austria' },
  { iso: 'PT', dialCode: '351', es: 'Portugal', en: 'Portugal' },
  { iso: 'SE', dialCode: '46', es: 'Suecia', en: 'Sweden' },
  { iso: 'NO', dialCode: '47', es: 'Noruega', en: 'Norway' },
  { iso: 'DK', dialCode: '45', es: 'Dinamarca', en: 'Denmark' },
  { iso: 'FI', dialCode: '358', es: 'Finlandia', en: 'Finland' },
  { iso: 'PL', dialCode: '48', es: 'Polonia', en: 'Poland' },
  { iso: 'UA', dialCode: '380', es: 'Ucrania', en: 'Ukraine' },
  { iso: 'RU', dialCode: '7', es: 'Rusia', en: 'Russia' },
  { iso: 'IL', dialCode: '972', es: 'Israel', en: 'Israel' },
  { iso: 'AE', dialCode: '971', es: 'Emiratos Árabes Unidos', en: 'United Arab Emirates' },
  { iso: 'ZA', dialCode: '27', es: 'Sudáfrica', en: 'South Africa' },
  { iso: 'IN', dialCode: '91', es: 'India', en: 'India' },
  { iso: 'CN', dialCode: '86', es: 'China', en: 'China' },
  { iso: 'JP', dialCode: '81', es: 'Japón', en: 'Japan' },
  { iso: 'KR', dialCode: '82', es: 'Corea del Sur', en: 'South Korea' },
  { iso: 'AU', dialCode: '61', es: 'Australia', en: 'Australia' },
  { iso: 'NZ', dialCode: '64', es: 'Nueva Zelanda', en: 'New Zealand' },
];

// Calling codes whose national numbers have one fixed length. Only these are checked beyond the generic E.164 range, so a wrong
// Costa Rican / North American number is caught instead of silently opening a chat with a stranger.
const FIXED_NATIONAL_LENGTH: Record<string, number> = { '506': 8, '1': 10 };

export type PhoneErrorReason = 'empty' | 'invalid_chars' | 'leading_zero' | 'wrong_length' | 'too_short' | 'too_long';

export type PhoneParseResult =
  | { valid: true; e164: string; dialCode: string; national: string; explicit: boolean }
  | { valid: false; reason: PhoneErrorReason; dialCode?: string; expectedLength?: number };

export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * ONE comparable value for a stored or incoming phone, used to recognise the same customer across formats. It is the TypeScript mirror of
 * public.phone_match_key (migration 202611240002); tests/customer-phone-matching.test.mjs runs both on the same inputs so they cannot drift.
 *  - a number written with "+" or "00" is international: its digits (without the "00");
 *  - a number with NO prefix and exactly 8 digits is a legacy Costa Rican local number (the old form accepted it): "506" + digits.
 *    The current flow never produces such a value, it always stores "+<country code><number>";
 *  - anything else: its digits. No digits -> null.
 */
export function phoneMatchKey(value: string | null | undefined): string | null {
  const raw = (value ?? '').replace(/^ +| +$/g, '');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const key = raw.startsWith('+') ? digits : digits.startsWith('00') ? digits.slice(2) : digits.length === 8 ? `506${digits}` : digits;
  return key || null;
}

export function getPhoneCountry(iso: string) {
  return PHONE_COUNTRIES.find((country) => country.iso === iso) ?? PHONE_COUNTRIES[0];
}

/** Costa Rica, United States and Canada first (the usual origins), then the rest alphabetically in the customer's language. */
export function getPhoneCountryOptions(language: 'es' | 'en') {
  const priority = ['CR', 'US', 'CA'];
  const first = priority.map((iso) => getPhoneCountry(iso));
  const rest = PHONE_COUNTRIES.filter((country) => !priority.includes(country.iso)).sort((a, b) => a[language].localeCompare(b[language], language));
  return [...first, ...rest].map((country) => ({ iso: country.iso, dialCode: country.dialCode, label: `${country[language]} (+${country.dialCode})` }));
}

function checkFixedLength(dialCode: string, national: string): PhoneParseResult | null {
  const expected = FIXED_NATIONAL_LENGTH[dialCode];
  if (expected && national.length !== expected) return { valid: false, reason: 'wrong_length', dialCode, expectedLength: expected };
  return null;
}

/**
 * Builds the international number. `countryIso` is the prefix the customer selected. A number typed with "+" or "00" is taken as already
 * international (the selector is then ignored, never combined with it). Nothing is ever inferred from the length of the digits.
 */
export function parsePhoneNumber(input: string, countryIso: string): PhoneParseResult {
  const raw = (input ?? '').trim();
  if (!raw) return { valid: false, reason: 'empty' };
  if (!/^\+?[\d\s().-]+$/.test(raw)) return { valid: false, reason: 'invalid_chars' };
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { valid: false, reason: 'empty' };

  if (raw.startsWith('+') || digits.startsWith('00')) {
    const international = raw.startsWith('+') ? digits : digits.replace(/^00/, '');
    if (!/^[1-9]/.test(international)) return { valid: false, reason: 'leading_zero' };
    if (international.length < 8) return { valid: false, reason: 'too_short' };
    if (international.length > 15) return { valid: false, reason: 'too_long' };
    const fixed = ['506', '1'].find((code) => international.startsWith(code));
    if (fixed) {
      const wrong = checkFixedLength(fixed, international.slice(fixed.length));
      if (wrong) return wrong;
    }
    return { valid: true, e164: `+${international}`, dialCode: fixed ?? '', national: fixed ? international.slice(fixed.length) : international, explicit: true };
  }

  const { dialCode } = getPhoneCountry(countryIso);
  if (digits.startsWith('0')) return { valid: false, reason: 'leading_zero', dialCode };
  const wrong = checkFixedLength(dialCode, digits);
  if (wrong) return wrong;
  const total = dialCode.length + digits.length;
  if (total < 8) return { valid: false, reason: 'too_short', dialCode };
  if (total > 15) return { valid: false, reason: 'too_long', dialCode };
  return { valid: true, e164: `+${dialCode}${digits}`, dialCode, national: digits, explicit: false };
}

/** Customer-facing explanation of why the number was not accepted (nothing is guessed on their behalf). */
export function phoneErrorMessage(result: PhoneParseResult, language: 'es' | 'en') {
  if (result.valid) return '';
  const es = language === 'es';
  switch (result.reason) {
    case 'empty': return es ? 'Ingresa el número de teléfono.' : 'Please enter the phone number.';
    case 'invalid_chars': return es ? 'El teléfono solo puede tener números, espacios y un "+" al inicio.' : 'The phone number can only contain digits, spaces and a leading "+".';
    case 'leading_zero': return es ? 'Escribe el número sin el 0 inicial, o con el "+" y el código de país.' : 'Enter the number without the leading 0, or with "+" and the country code.';
    case 'wrong_length': return es
      ? `Con el prefijo +${result.dialCode} el número debe tener ${result.expectedLength} dígitos. Si es de otro país, cambia el prefijo.`
      : `With the +${result.dialCode} prefix the number must have ${result.expectedLength} digits. If it is from another country, change the prefix.`;
    case 'too_short': return es ? 'El número es demasiado corto.' : 'The phone number is too short.';
    default: return es ? 'El número es demasiado largo.' : 'The phone number is too long.';
  }
}
