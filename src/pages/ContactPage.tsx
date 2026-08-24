import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Container } from '../components/common/Container';
import { Button, CardShell, ChoiceCard, Field, FieldError, GlassPanel, Input, SectionHeader, Select, TextArea } from '../components/ui';
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

  return (
    <main className="bg-ocean-950 text-white">
      <section className="relative min-h-screen overflow-hidden bg-ocean-900 pb-20 pt-32 sm:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(110,172,201,0.22),transparent_26rem),linear-gradient(180deg,#133E62_0%,#1A466C_46%,#0B2842_100%)]" />
        <Container className="relative">
          <SectionHeader description={copy.subtitle} eyebrow={copy.eyebrow} level={1} title={copy.title} variant="hero" />

          <GlassPanel className="mx-auto mt-10 grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-5" variant="surface">
            <form className="p-2 sm:p-4 lg:p-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <h2 className="text-xl font-extrabold text-white">{copy.formTitle}</h2>
                <p className="mt-1 max-w-xl text-xs leading-5 text-ocean-200">
                  {copy.formDescription}
                </p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field error={errors.name?.message} errorId="contact-name-error" htmlFor="contact-name" label={copy.name}>
                  <Input id="contact-name" aria-describedby={errors.name ? 'contact-name-error' : undefined} aria-invalid={Boolean(errors.name)} autoComplete="name" className="font-semibold placeholder:text-ocean-400" placeholder={copy.namePlaceholder} shape="pill" tone="deep" {...register('name')} />
                </Field>
                <Field error={errors.email?.message} errorId="contact-email-error" htmlFor="contact-email" label={copy.email}>
                  <Input id="contact-email" aria-describedby={errors.email ? 'contact-email-error' : undefined} aria-invalid={Boolean(errors.email)} autoComplete="email" className="font-semibold placeholder:text-ocean-400" placeholder={copy.emailPlaceholder} shape="pill" spellCheck={false} tone="deep" type="email" {...register('email')} />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field error={errors.tourType?.message} errorId="contact-tour-error" htmlFor="contact-tour" label={copy.experience}>
                  <Select id="contact-tour" aria-describedby={errors.tourType ? 'contact-tour-error' : undefined} aria-invalid={Boolean(errors.tourType)} autoComplete="off" className="font-semibold" shape="pill" tone="deep" {...register('tourType')}>
                    <option value="">{copy.selectExperience}</option>
                    {tours.map((tour) => (
                      <option key={tour.id} value={tour.slug}>
                        {tour.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="contact-phone" label={copy.phone}>
                  <Input id="contact-phone" autoComplete="tel" className="font-semibold placeholder:text-ocean-400" placeholder={copy.phonePlaceholder} shape="pill" tone="deep" />
                </Field>
              </div>

              <fieldset className="mt-5">
                <legend className="text-xs font-extrabold text-ocean-100">{copy.time}</legend>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {departureTimes.map((departure) => (
                    <ChoiceCard
                      as="label"
                      key={departure.id}
                      className="cursor-pointer px-4 py-3 shadow-sm"
                      selected={selectedTime === departure.id}
                      shape="soft"
                    >
                      <input className="sr-only" type="radio" value={departure.id} {...register('departureTime')} />
                      <span className="text-sm font-extrabold text-white">{departure.label}</span>
                      <span className="mt-0.5 block text-lg font-extrabold text-ocean-300">{departure.time}</span>
                    </ChoiceCard>
                  ))}
                </div>
                {errors.departureTime ? <FieldError className="mt-2" id="contact-time-error">{errors.departureTime.message}</FieldError> : null}
              </fieldset>

              <Field className="mt-4" error={errors.message?.message} errorId="contact-message-error" htmlFor="contact-message" label={copy.message}>
                <TextArea
                  id="contact-message"
                  aria-describedby={errors.message ? 'contact-message-error' : undefined}
                  aria-invalid={Boolean(errors.message)}
                  className="min-h-28 font-semibold placeholder:text-ocean-400"
                  placeholder={copy.messagePlaceholder}
                  autoComplete="off"
                  shape="soft"
                  tone="deep"
                  {...register('message')}
                />
              </Field>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {isSubmitSuccessful ? (
                  <p className="rounded-full border border-ocean-300/40 bg-ocean-500/15 px-4 py-2 text-xs font-extrabold text-ocean-100" aria-live="polite">
                    {copy.success}
                  </p>
                ) : (
                  <span className="text-xs font-semibold text-ocean-300">{copy.availability}</span>
                )}
                <Button className="w-full sm:w-auto" type="submit">
                  {copy.submit}
                </Button>
              </div>
            </form>

            <GlassPanel as="aside" className="p-6 text-white lg:p-7" variant="panel">
              <h2 className="text-xl font-extrabold">{copy.asideTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-ocean-200">
                {copy.asideDescription}
              </p>

              <div className="mt-7 grid gap-3">
                <CardShell as="a" className="flex-row items-center gap-3 p-4" href={`tel:${DISPLAY_PHONE.replace(/\s/g, '')}`} interactive>
                  <Phone className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.phoneLabel}</span>
                    <span className="text-sm font-bold text-white">{DISPLAY_PHONE}</span>
                  </span>
                </CardShell>
                <CardShell as="a" className="flex-row items-center gap-3 p-4" href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer" interactive>
                  <MessageCircle className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.whatsappLabel}</span>
                    <span className="text-sm font-bold text-white">{DISPLAY_PHONE}</span>
                  </span>
                </CardShell>
                <CardShell as="a" className="flex-row items-center gap-3 p-4" href="mailto:info@papagayofishingtours.com" interactive>
                  <Mail className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.emailLabel}</span>
                    <span className="text-sm font-bold text-white">info@papagayofishingtours.com</span>
                  </span>
                </CardShell>
                <GlassPanel className="flex items-center gap-3 p-4" variant="subtle">
                  <MapPin className="text-ocean-300" size={20} />
                  <span>
                    <span className="block text-xs font-extrabold text-ocean-300">{copy.locationLabel}</span>
                    <span className="text-sm font-bold text-white">{copy.location}</span>
                  </span>
                </GlassPanel>
              </div>

              <Button
                className="mt-7"
                fullWidth
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
              >
                <MessageCircle size={18} /> {copy.whatsappCta}
              </Button>
            </GlassPanel>
          </GlassPanel>
        </Container>
      </section>
    </main>
  );
}
