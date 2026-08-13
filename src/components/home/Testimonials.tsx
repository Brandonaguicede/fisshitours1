import { Star } from 'lucide-react';

import { testimonials } from '../../data/testimonials';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';

export function Testimonials() {
  return (
    <section className="section-y bg-white/75">
      <Container>
        <SectionTitle eyebrow="Testimonios" title="Viajeros que ya encontraron su pura ruta" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article className="glass-card rounded-4xl p-6" key={testimonial.id}>
              <div className="flex gap-1 text-amber-400">
                {Array.from({ length: testimonial.rating }).map((_, index) => (
                  <Star key={index} className="fill-current" size={16} />
                ))}
              </div>
              <p className="mt-5 text-lg leading-8 text-stone-700">"{testimonial.quote}"</p>
              <div className="mt-6 border-t border-ocean-200 pt-5">
                <p className="font-extrabold text-stone-950">{testimonial.name}</p>
                <p className="text-sm text-stone-500">{testimonial.country}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
