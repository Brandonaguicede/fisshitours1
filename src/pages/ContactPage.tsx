import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../components/common/Button';
import { Container } from '../components/common/Container';
import { DISPLAY_PHONE, WHATSAPP_NUMBER } from '../constants/contact';
import { departureTimes } from '../data/departureTimes';
import { tours } from '../data/tours';
import { useLanguage } from '../i18n/LanguageContext';

const contactText = {
  es: {
    eyebrow: 'Contacto / reservas',
    title: 'Contactanos',
    subtitle: 'Envia tus datos y te respondemos con disponibilidad, horario recomendado y siguientes pasos.',
    formTitle: 'Envia un mensaje',
    formDescription: 'Completa el formulario con el tour, turno y detalles de tu grupo.',
    name: 'Nombre',
    namePlaceholder: 'Tu nombre',
    email: 'Correo',
    emailPlaceholder: 'correo@ejemplo.com',
    experience: 'Tipo de experiencia',
    selectExperience: 'Selecciona una opcion',
    phone: 'Telefono / WhatsApp',
    phonePlaceholder: '+506 8888 8888',
    time: 'Turno',
    message: 'Mensaje',
    messagePlaceholder: 'Ej. Viajamos 4 personas, queremos mitad fishing y mitad playa.',
    success: 'Solicitud registrada. Te contactaremos pronto.',
    availability: 'Confirmamos disponibilidad antes de cualquier pago.',
    submit: 'Enviar mensaje',
    asideTitle: 'Siempre estamos listos para ayudarte',
    asideDescription: 'Papagayo Fishing Tours coordina charters privados de pesca, snorkeling, playa y navegacion en Guanacaste.',
    phoneLabel: 'Telefono',
    whatsappLabel: 'WhatsApp',
    emailLabel: 'Email',
    locationLabel: 'Ubicacion',
    location: 'Guanacaste, Costa Rica',
    whatsappCta: 'Escribir por WhatsApp',
    errors: {
      name: 'Ingresa tu nombre',
      email: 'Ingresa un correo valido',
      tourType: 'Selecciona un tipo de experiencia',
      departureTime: 'Selecciona un turno',
      message: 'Cuentanos un poco mas sobre tu viaje',
    },
  },
  en: {
    eyebrow: 'Contact / bookings',
    title: 'Contact us',
    subtitle: 'Send your details and we will reply with availability, recommended time and next steps.',
    formTitle: 'Send us a message',
    formDescription: 'Complete the form with your tour, departure time and group details.',
    name: 'Name',
    namePlaceholder: 'Your name',
    email: 'Email',
    emailPlaceholder: 'email@example.com',
    experience: 'Experience type',
    selectExperience: 'Select an option',
    phone: 'Phone / WhatsApp',
    phonePlaceholder: '+506 8888 8888',
    time: 'Departure time',
    message: 'Message',
    messagePlaceholder: 'Example: We are 4 people and want half fishing, half beach.',
    success: 'Request received. We will contact you soon.',
    availability: 'We confirm availability before any payment.',
    submit: 'Send message',
    asideTitle: 'We are always ready to help',
    asideDescription: 'Papagayo Fishing Tours coordinates private fishing, snorkeling, beach and cruising charters in Guanacaste.',
    phoneLabel: 'Phone',
    whatsappLabel: 'WhatsApp',
    emailLabel: 'Email',
    locationLabel: 'Location',
    location: 'Guanacaste, Costa Rica',
    whatsappCta: 'Message us on WhatsApp',
    errors: {
      name: 'Enter your name',
      email: 'Enter a valid email',
      tourType: 'Select an experience type',
      departureTime: 'Select a departure time',
      message: 'Tell us a little more about your trip',
    },
  },
} as const;

type ContactFormValues = {
  name: string;
  email: string;
  tourType: string;
  departureTime: string;
  message: string;
};

export default function ContactPage() {
  const { language } = useLanguage();
  const copy = contactText[language];
  const contactSchema = z.object({
    name: z.string().min(2, copy.errors.name),
    email: z.string().email(copy.errors.email),
    tourType: z.string().min(1, copy.errors.tourType),
    departureTime: z.string().min(1, copy.errors.departureTime),
    message: z.string().min(10, copy.errors.message),
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitSuccessful },
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', tourType: '', departureTime: 'morning', message: '' },
  });

  const selectedTime = watch('departureTime');

  function onSubmit(values: ContactFormValues) {
    console.info('Reserva solicitada', values);
    reset();
  }

  const inputClass =
    'focus-ring rounded-full border border-white/10 bg-ocean-950/70 px-4 py-3 text-sm font-semibold text-white shadow-sm transition placeholder:text-ocean-400 focus:border-ocean-300 focus:ring-4 focus:ring-ocean-400/15';

  return (
    <main className="bg-ocean-950 text-white">
      <section className="relative min-h-screen overflow-hidden bg-ocean-900 pb-20 pt-32 sm:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(110,172,201,0.22),transparent_26rem),linear-gradient(180deg,#133E62_0%,#1A466C_46%,#0B2842_100%)]" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-ocean-200">{copy.eyebrow}</p>
            <h1 className="mt-3 font-display text-5xl font-extrabold leading-none text-white sm:text-6xl">
              {copy.title}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-ocean-200">
              {copy.subtitle}
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl gap-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-lifted backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:p-5">
            <form className="p-2 sm:p-4 lg:p-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <h2 className="text-xl font-extrabold text-white">{copy.formTitle}</h2>
                <p className="mt-1 max-w-xl text-xs leading-5 text-ocean-200">
                  {copy.formDescription}
                </p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-xs font-extrabold text-ocean-100">
                  {copy.name}
                  <input className={inputClass} placeholder={copy.namePlaceholder} autoComplete="name" {...register('name')} />
                  {errors.name ? <span className="text-xs font-semibold text-red-600">{errors.name.message}</span> : null}
                </label>
                <label className="grid gap-2 text-xs font-extrabold text-ocean-100">
                  {copy.email}
                  <input className={inputClass} type="email" placeholder={copy.emailPlaceholder} autoComplete="email" spellCheck={false} {...register('email')} />
                  {errors.email ? <span className="text-xs font-semibold text-red-600">{errors.email.message}</span> : null}
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-xs font-extrabold text-ocean-100">
                  {copy.experience}
                  <select className={inputClass} autoComplete="off" {...register('tourType')}>
                    <option value="">{copy.selectExperience}</option>
                    {tours.map((tour) => (
                      <option key={tour.id} value={tour.slug}>
                        {tour.title}
                      </option>
                    ))}
                  </select>
                  {errors.tourType ? <span className="text-xs font-semibold text-red-600">{errors.tourType.message}</span> : null}
                </label>
                <label className="grid gap-2 text-xs font-extrabold text-ocean-100">
                  {copy.phone}
                  <input className={inputClass} placeholder={copy.phonePlaceholder} autoComplete="tel" />
                </label>
              </div>

              <fieldset className="mt-5">
                <legend className="text-xs font-extrabold text-ocean-100">{copy.time}</legend>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {departureTimes.map((departure) => (
                    <label
                      key={departure.id}
                      className={`pressable cursor-pointer rounded-2xl border px-4 py-3 shadow-sm transition ${
                        selectedTime === departure.id
                          ? 'border-ocean-300 bg-ocean-500/15 ring-4 ring-ocean-400/10'
                          : 'border-white/10 bg-white/[0.04] hover:border-ocean-300/60 hover:bg-white/[0.08]'
                      }`}
                    >
                      <input className="sr-only" type="radio" value={departure.id} {...register('departureTime')} />
                      <span className="text-sm font-extrabold text-white">{departure.label}</span>
                      <span className="mt-0.5 block text-lg font-extrabold text-ocean-300">{departure.time}</span>
                    </label>
                  ))}
                </div>
                {errors.departureTime ? <span className="mt-2 block text-xs font-semibold text-red-600">{errors.departureTime.message}</span> : null}
              </fieldset>

              <label className="mt-4 grid gap-2 text-xs font-extrabold text-ocean-100">
                {copy.message}
                <textarea
                  className={`${inputClass} min-h-28 resize-y rounded-2xl`}
                  placeholder={copy.messagePlaceholder}
                  autoComplete="off"
                  {...register('message')}
                />
                {errors.message ? <span className="text-xs font-semibold text-red-600">{errors.message.message}</span> : null}
              </label>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {isSubmitSuccessful ? (
                  <p className="rounded-full border border-ocean-300/40 bg-ocean-500/15 px-4 py-2 text-xs font-extrabold text-ocean-100" aria-live="polite">
                    {copy.success}
                  </p>
                ) : (
                  <span className="text-xs font-semibold text-ocean-300">{copy.availability}</span>
                )}
                <Button className="w-full bg-ocean-500 px-6 text-ocean-950 hover:bg-ocean-300 sm:w-auto" type="submit">
                  {copy.submit}
                </Button>
              </div>
            </form>

            <aside className="rounded-[1.45rem] bg-ocean-950 p-6 text-white shadow-lifted lg:p-7">
              <h2 className="text-xl font-extrabold">{copy.asideTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-ocean-200">
                {copy.asideDescription}
              </p>

              <div className="mt-7 grid gap-3">
                <a className="focus-ring pressable flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] p-4 hover:bg-white/[0.13]" href={`tel:${DISPLAY_PHONE.replace(/\s/g, '')}`}>
                  <Phone className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.phoneLabel}</span>
                    <span className="text-sm font-bold text-white">{DISPLAY_PHONE}</span>
                  </span>
                </a>
                <a className="focus-ring pressable flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] p-4 hover:bg-white/[0.13]" href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.whatsappLabel}</span>
                    <span className="text-sm font-bold text-white">{DISPLAY_PHONE}</span>
                  </span>
                </a>
                <a className="focus-ring pressable flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] p-4 hover:bg-white/[0.13]" href="mailto:info@papagayofishingtours.com">
                  <Mail className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.emailLabel}</span>
                    <span className="text-sm font-bold text-white">info@papagayofishingtours.com</span>
                  </span>
                </a>
                <span className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] p-4">
                  <MapPin className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.locationLabel}</span>
                    <span className="text-sm font-bold text-white">{copy.location}</span>
                  </span>
                </span>
              </div>

              <a
                className="focus-ring pressable mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ocean-500 px-5 py-2.5 text-sm font-extrabold text-ocean-950 shadow-soft hover:-translate-y-0.5 hover:bg-ocean-300 hover:shadow-lifted"
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={18} /> {copy.whatsappCta}
              </a>
            </aside>
          </div>
        </Container>
      </section>
    </main>
  );
}
