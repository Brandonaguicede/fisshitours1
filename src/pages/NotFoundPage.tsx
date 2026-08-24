import { Button } from '../components/ui';
import { Container } from '../components/common/Container';
import { useLanguage } from '../i18n/LanguageContext';

export default function NotFoundPage() {
  const { language } = useLanguage();

  return (
    <section className="section-y text-center">
      <Container>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-ocean-600">404</p>
        <h1 className="mt-4 text-4xl font-extrabold text-white">{language === 'es' ? 'Ruta no encontrada' : 'Page not found'}</h1>
        <p className="mx-auto mt-4 max-w-xl text-ocean-200">{language === 'es' ? 'La página que buscas no existe o fue movida.' : 'The page you are looking for does not exist or was moved.'}</p>
        <Button className="mt-8" to="/">
          {language === 'es' ? 'Volver al inicio' : 'Back home'}
        </Button>
      </Container>
    </section>
  );
}
