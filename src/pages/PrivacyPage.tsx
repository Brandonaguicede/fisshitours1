import { Container } from '../components/common/Container';
import { BackToHomeButton } from '../components/common/BackToHomeButton';
import { CONTACT_EMAIL } from '../constants/contact';
import { useLanguage } from '../i18n/LanguageContext';

export default function PrivacyPage() {
  const { language } = useLanguage();
  const es = language === 'es';
  const sections = es ? [
    ['Reservas y pagos', 'Papagayo Fishing Tours utiliza los datos de tu reserva para atenderte, coordinar el tour y gestionar el pago. Los proveedores de pago y seguridad necesarios operan en su propio flujo. Rechazar la medición opcional no impide reservar ni pagar.'],
    ['Tus preferencias', 'Puedes aceptar, rechazar o elegir analítica y publicidad por separado en el botón Cookies. Guardamos tu decisión en este navegador durante un máximo de 180 días. Puedes retirarla en cualquier momento; no se reproducen automáticamente acciones anteriores a tu permiso.'],
    ['Analítica opcional', 'Con permiso de analítica, Google puede medir páginas, barcos, tours, paquetes y acciones aceptadas de formularios. Los eventos incluyen rutas sin parámetros privados, origen de procedencia sin su ruta y campañas con formato limitado. La configuración externa de medición debe revisarse antes de activarla.'],
    ['Publicidad opcional', 'Con permiso publicitario, Google Ads y Meta pueden medir consultas, clics y pagos confirmados. Se utilizan identificadores opacos de reserva o transacción, importe y moneda cuando corresponde. No enviamos datos de tarjeta, mensajes de WhatsApp ni campos completos de formularios a la capa general de eventos. Los identificadores opacos no convierten estos datos en anónimos.'],
    ['Campañas y conservación', 'Solo después de tu permiso conservamos campañas permitidas y, con permiso publicitario, identificadores de clic como GCLID o FBCLID. El contexto local dura como máximo 30 minutos en esta pestaña. Los eventos pendientes y la deduplicación viven en memoria hasta 30 minutos o hasta retirar el permiso. No se guardan comprobantes locales permanentes de entrega.'],
    ['Proveedores y conversiones mejoradas', 'Google y Meta pueden procesar datos fuera de Costa Rica según sus políticas. La función opcional de conversiones mejoradas está desactivada por defecto; si se habilita tras revisión y con permiso publicitario, pone el email de una acción aceptada a disposición de Google durante hasta cinco segundos para normalización y hash. Ese email no se incorpora al dataLayer general ni a Meta.'],
    ['Retirada y solicitudes', `Retirar el permiso detiene los nuevos eventos propios y limpia el contexto local de la categoría retirada y las cookies de medición accesibles. No retira envíos ya efectuados ni elimina registros financieros. Para consultas, acceso, corrección o eliminación cuando proceda, escribe a ${CONTACT_EMAIL}. La conservación externa y las solicitudes a proveedores deben revisarse con el responsable del servicio.`],
    ['Revisión', 'Información técnica actualizada el 11 de noviembre de 2026. La configuración final de proveedores, sus plazos de conservación y los mecanismos aplicables de privacidad requieren revisión antes de activar publicidad. Este texto no constituye una certificación de cumplimiento jurídico.'],
  ] : [
    ['Bookings and payments', 'Papagayo Fishing Tours uses booking information to assist you, arrange your tour and manage payment. Necessary payment and security providers operate in their own flows. Rejecting optional measurement does not prevent booking or payment.'],
    ['Your choices', 'Use the Cookies button to accept, reject or choose analytics and advertising separately. Your choice is stored in this browser for up to 180 days. You can withdraw it at any time; earlier actions are not automatically replayed after permission.'],
    ['Optional analytics', 'With analytics permission, Google may measure pages, boats, tours, packages and accepted form actions. Events include paths without private parameters, referring origin without its path, and campaigns with limited formats. External measurement configuration must be reviewed before activation.'],
    ['Optional advertising', 'With advertising permission, Google Ads and Meta may measure enquiries, clicks and confirmed payments. Events can include opaque booking or transaction identifiers, amount and currency. Card data, WhatsApp messages and complete form fields are not sent to the general event layer. Opaque identifiers do not make these data anonymous.'],
    ['Campaigns and retention', 'Only after permission, allowed campaigns and, with advertising permission, click identifiers such as GCLID or FBCLID are retained. Local context lasts up to 30 minutes in this tab. Pending events and deduplication remain in memory for up to 30 minutes or until permission is withdrawn. No permanent local delivery receipts are stored.'],
    ['Providers and enhanced conversions', 'Google and Meta may process data outside Costa Rica under their policies. Optional enhanced conversions are disabled by default. If enabled after review and with advertising permission, the email from an accepted action is available to Google for up to five seconds for normalization and hashing. It is not placed in the general dataLayer or sent to Meta.'],
    ['Withdrawal and requests', `Withdrawal stops new first-party events and clears local context for the withdrawn category and accessible measurement cookies. It does not recall previous transmissions or delete financial records. For questions, access, correction or deletion where applicable, contact ${CONTACT_EMAIL}. External retention and provider requests must be reviewed with the service operator.`],
    ['Review', 'Technical information updated November 11, 2026. Final provider configuration, external retention periods and applicable privacy mechanisms require review before advertising is activated. This text is not a certification of legal compliance.'],
  ];
  return <main className="tours-ocean-atmosphere text-white">
    <section className="pb-16 pt-20 sm:pt-24">
      <Container className="max-w-3xl">
        <BackToHomeButton />
        <h1 className="mt-4 text-3xl font-extrabold">{es ? 'Privacidad y cookies' : 'Privacy and cookies'}</h1>
        {sections.map(([title, body]) => <section key={title} className="mt-8">
          <h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-7 text-ocean-100">{body}</p>
        </section>)}
        <p className="mt-8"><a className="underline" href="https://policies.google.com/privacy">Google Privacy</a>{' · '}
          <a className="underline" href="https://www.facebook.com/privacy/policy/">Meta Privacy</a></p>
      </Container>
    </section>
  </main>;
}
