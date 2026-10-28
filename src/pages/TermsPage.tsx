import { TermsSections } from '../components/booking/TermsModal';
import { BackToHomeButton } from '../components/common/BackToHomeButton';
import { Container } from '../components/common/Container';
import { CONTACT_EMAIL, DISPLAY_PHONE } from '../constants/contact';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Public, linkable Terms and Conditions (the card acquirer requires them to be reachable from the home page).
 * The policy text comes from the same component as the booking modal, so it can never drift from what customers accept.
 */
export default function TermsPage() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <main className="tours-ocean-atmosphere text-white">
      <section className="pb-16 pt-20 sm:pt-24 lg:pt-24">
        <Container className="max-w-3xl">
          <BackToHomeButton />
          <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">{es ? 'Términos y Condiciones' : 'Terms and Conditions'}</h1>
          <p className="mt-2 text-sm text-ocean-200">Papagayo Fishing Tours · {CONTACT_EMAIL} · {DISPLAY_PHONE}</p>
          <div className="mt-8">
            <TermsSections language={language} headingLevel="h2" />
          </div>
        </Container>
      </section>
    </main>
  );
}
