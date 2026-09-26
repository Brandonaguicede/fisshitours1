import type { Language } from './LanguageContext';

export const text = {
  nav: {
    home: { es: 'Inicio', en: 'Home' },
    boats: { es: 'Barcos', en: 'Boats' },
    tours: { es: 'Tours', en: 'Tours' },
    gallery: { es: 'Galería', en: 'Gallery' },
    about: { es: 'Nosotros', en: 'About' },
    contact: { es: 'Contacto', en: 'Contact' },
    book: { es: 'Reservar', en: 'Book Now' },
    reviews: { es: 'Comentarios', en: 'Reviews' },
  },
  home: {
    fleetTitle: { es: 'Conoce nuestros barcos', en: 'Meet Our Boats' },
    toursTitle: { es: 'Todos los tours en el mar', en: 'All Ocean Tours' },
    toursAvailable: { es: 'tours disponibles', en: 'tours available' },
    galleryTitle: { es: 'Momentos en el océano, días de pesca y agua costarricense', en: 'Ocean moments, fishing days and Costa Rican water' },
    bookingTitle: { es: 'Reserva tu experiencia', en: 'Reserve Your Experience' },
    bookingDescription: { es: 'Tu próxima experiencia en el mar comienza aquí.', en: 'Your next experience at sea starts here.' },
    bookingNoSelection: { es: 'Empieza eligiendo tu bote y personaliza tu experiencia.', en: 'Start by choosing your boat and customize your experience.' },
    bookingHelper: { es: 'Rápido, seguro y en solo unos pasos.', en: 'Fast, secure and just a few steps.' },
  },
  booking: {
    steps: {
      boat: { es: 'Elige tu Barco', en: 'Choose Boat' },
      tour: { es: 'Detalles del Tour', en: 'Tour Details' },
      data: { es: 'Tus Datos', en: 'Your Details' },
    },
    badge: { es: 'Reservas', en: 'Bookings' },
    // A package that cannot be booked (bad configuration, race with an admin change): never a technical message for the customer.
    packageUnavailable: {
      es: 'Esta opción no está disponible temporalmente. Elige otro paquete o contáctanos para recibir ayuda.',
      en: 'This option is temporarily unavailable. Please choose another package or contact us for assistance.',
    },
    privateFleet: { es: 'Flota privada', en: 'Private fleet' },
    chooseBoat: { es: 'Elige tu Barco', en: 'Choose your boat' },
    people: { es: 'personas', en: 'people' },
    continue: { es: 'Continuar', en: 'Continue' },
    tourDetails: { es: 'Detalles del tour', en: 'Tour details' },
    buildReservation: { es: 'Arma tu reserva', en: 'Build your reservation' },
    tourAboard: { es: 'Tour a bordo de', en: 'Tour aboard' },
    selectTour: { es: 'Selecciona un tour a bordo de', en: 'Select a tour aboard' },
    date: { es: 'Fecha', en: 'Date' },
    guests: { es: 'Personas', en: 'Guests' },
    departure: { es: 'Hora de salida', en: 'Departure time' },
    back: { es: 'Volver', en: 'Back' },
    continueData: { es: 'Continuar a tus datos', en: 'Continue to your details' },
    yourData: { es: 'Tus datos', en: 'Your details' },
    basicInfo: { es: 'Información básica', en: 'Basic information' },
    fullName: { es: 'Nombre completo', en: 'Full name' },
    email: { es: 'Correo electrónico', en: 'Email address' },
    phone: { es: 'Teléfono / WhatsApp', en: 'Phone / WhatsApp' },
    confirm: { es: 'Confirmar Reserva', en: 'Confirm Reservation' },
    summary: { es: 'Resumen de tu Reserva', en: 'Reservation Summary' },
    tourType: { es: 'Tipo de tour', en: 'Tour type' },
    selectTime: { es: 'Selecciona hora', en: 'Select time' },
    extraPeople: { es: 'Personas extra', en: 'Extra guests' },
    taxes: { es: 'Extras', en: 'Extras' },
    startBooking: { es: 'Empezar reserva', en: 'Start booking' },
  },
} as const;

export function tr(entry: { es: string; en: string }, language: Language) {
  return entry[language];
}
