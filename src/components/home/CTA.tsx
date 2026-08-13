import { ArrowRight } from 'lucide-react';

import { Button } from '../common/Button';
import { Container } from '../common/Container';

export function CTA() {
  return (
    <section className="section-y">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-ocean-900 px-6 py-14 text-white shadow-lifted sm:px-12 lg:px-16">
          <img
            className="absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover opacity-55 lg:block"
            src="/images/placeholder-image.jpg"
            alt=""
            aria-hidden="true"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ocean-950 via-ocean-900/90 to-ocean-600/25" />
          <div className="relative max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">Reserva flexible</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold leading-tight sm:text-5xl">Arma tu tour por turno: fishing, playa o bioluminiscencia</h2>
            <p className="mt-5 text-lg leading-8 text-ocean-200">
              Cuéntanos fecha, cantidad de personas y si quieres mitad playa, mitad fishing. Te devolvemos una propuesta clara por turno.
            </p>
            <Button className="mt-8 gap-2" variant="secondary" to="/tours">
              Crear tour personalizado <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
