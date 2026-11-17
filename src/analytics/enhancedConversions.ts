import { getConsent } from './consent';
// Dedicated, short-lived source for GTM's official User-provided Data variable.
// Google performs normalization and SHA-256. Never push this data to dataLayer.
let email: string | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
declare global { interface Window { pftEnhancedConversionEmail?: () => string | undefined } }
export function stageEnhancedConversionEmail(value: string) {
  clearEnhancedConversionEmail();
  if (import.meta.env.VITE_ENHANCED_CONVERSIONS_ENABLED !== 'true' || !getConsent().marketing) return;
  email = value;
  window.pftEnhancedConversionEmail = () => getConsent().marketing ? email : undefined;
  expiry = setTimeout(clearEnhancedConversionEmail, 5000);
}
export function clearEnhancedConversionEmail() {
  email = undefined;
  if (expiry) clearTimeout(expiry);
  delete window.pftEnhancedConversionEmail;
}
window.addEventListener('pft-consent-change', () => {
  if (!getConsent().marketing) clearEnhancedConversionEmail();
});
