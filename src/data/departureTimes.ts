import type { DepartureTime } from '../types/departureTime';

export const departureTimes: DepartureTime[] = [
  {
    id: 'morning',
    label: 'Morning',
    time: '7:00 AM',
    description: 'Fishing, snorkeling o salida suave antes del sol fuerte.',
  },
  {
    id: 'midday',
    label: 'Midday',
    time: '11:30 AM',
    description: 'Playa, juguetes acuáticos y navegación costera.',
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    time: '3:30 PM',
    description: 'Atardecer, playa y conexión con tours nocturnos.',
  },
];
