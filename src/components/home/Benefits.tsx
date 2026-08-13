import { Anchor, Clock3, ShieldCheck, Waves } from 'lucide-react';

import { Container } from '../common/Container';

const benefits = [
  { title: 'Tres turnos', description: 'Elige mañana, tarde o noche según clima, marea y plan del grupo.', icon: Clock3 },
  { title: 'Pesca segura', description: 'Capitán local, equipo listo y rutas definidas por temporada.', icon: Anchor },
  { title: 'Playa completa', description: 'Snorkeling, juguetes acuáticos, descanso y asistencia en sitio.', icon: Waves },
  { title: 'Plan personalizado', description: 'Combinamos pesca, playa y bioluminiscencia en una sola propuesta.', icon: ShieldCheck },
];

export function Benefits() {
  return (
    <section className="section-y bg-white/70">
      <Container>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit, index) => (
            <div key={benefit.title} className={index === 1 ? 'glass-dark rounded-4xl bg-ocean-900/90 p-6 text-white shadow-lifted' : 'glass-card rounded-4xl p-6'}>
              <div className={index === 1 ? 'grid h-12 w-12 place-items-center rounded-full bg-white text-ocean-600' : 'grid h-12 w-12 place-items-center rounded-full bg-ocean-100 text-ocean-600'}>
                <benefit.icon size={24} />
              </div>
              <h3 className="mt-5 text-lg font-extrabold">{benefit.title}</h3>
              <p className={index === 1 ? 'mt-2 text-sm leading-6 text-ocean-200' : 'mt-2 text-sm leading-6 text-stone-700'}>{benefit.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
