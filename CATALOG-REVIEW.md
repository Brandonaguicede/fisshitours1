# Revision del catalogo publico de tours

## 1. Causa raiz

TourCarouselSection agrupaba por boatId + categoria. Esto producia una tarjeta por bote para un mismo tour y tambien fusionaba tours diferentes dentro de una categoria. ToursPage duplicaba ese agrupador. BookingPanel agrupaba por categoria y el modal solo recibia un bote.

## 2. Archivos modificados

- src/utils/tourCatalog.ts: agregado tipado TourCatalogItem / TourBoatOption y agrupacion compartida.
- src/types/boatTour.ts: contenido compartido del Tour y estado activo del catalogo, sin modificar el modelo de Supabase.
- src/services/catalogMappers.ts: separa contenido del Tour y preserva el precio nulo como invalido, junto con los IDs originales.
- src/components/home/TourCarouselSection.tsx: una tarjeta por tourId despues de aplicar el filtro existente por bote; mantiene controles, scroll, animaciones y responsive.
- src/components/tours/BoatTourCard.tsx: precio minimo agregado, cantidad de botes, informacion comercial trasladada al modal y sesiones nuevas al abrirlo.
- src/components/tours/TourDetailModal.tsx: seleccion de bote y paquete, detalles especificos y boton Reservar visible durante el scroll.
- src/pages/ToursPage.tsx: usa el mismo agregador para los tours del bote seleccionado.
- src/hooks/useBookingCatalog.ts: un resultado vacio de la API ya no se reemplaza por tours de ejemplo.
- src/components/booking/BookingPanel.tsx: grupos por tourId, validacion de identidad y reinicio de estados cuando cambia el padre, tambien por cambios desde el contexto compartido.
- package.json: comando test:catalog.
- tests/tour-catalog/grouping.mjs, catalog.spec.ts, fixture.tsx, fixture.html y playwright.config.ts: pruebas de dominio y navegador aisladas.

## 3. Agrupacion

Map indexado exclusivamente por tourId. La opcion interna conserva el bote, el boatTourId y sus paquetes originales. No se reconstruyen IDs por nombre, categoria, posicion o precio. Dos tours diferentes con la misma categoria siguen separados.

## 4. From / Desde

Se calcula Math.min sobre todos los paquetes validos del conjunto filtrado, en todos sus botes. No depende del orden de la API. Se excluyen estado inactivo, customQuote, precios no numericos/no finitos/nulos/no positivos y paquetes sin horarios activos configurados. Esto respeta las comprobaciones actuales de reserva con precio y horario. La API existente ya filtra paquetes, asociaciones, botes y tours activos. La disponibilidad por fecha sigue siendo responsabilidad del endpoint de disponibilidad.

## 5. Seleccion de bote

Varios botes: primero elegir bote; Reservar permanece deshabilitado hasta elegir un paquete. Un bote: se selecciona automaticamente y se muestran sus paquetes sin agregar un paso. La tarjeta solo presenta contenido del Tour, From y cantidad de botes; no atribuye al Tour la capacidad, duracion ni inclusiones de un paquete arbitrario.

## 6. Paquetes por BoatTour

Cada opcion contiene solo paquetes con su boatId y boatTourId. El modal revalida tambien tourId antes de mostrar o seleccionar un paquete. Duracion, capacidad efectiva, invitados incluidos, invitados adicionales, descripcion, horarios, inclusiones y comidas provienen del paquete seleccionado. Actividades y galeria actualmente pertenecen al Tour en la API; se conservan esos datos. Los extras del flujo publico siguen enviandose como [] y el calculo del backend queda ligado al paquete; no se inventa un nuevo selector ni se cambian reglas comerciales.

## 7. Identidad de la reserva

Reservar entrega el objeto BoatTour original del paquete seleccionado al contexto compartido. HomePage ya establece el boatId del objeto y navega a /reservar. BookingPanel acepta ese paquete solo si coinciden packageId, boatId, tourId y boatTourId con el catalogo actual.

La solicitud de precio conserva boatId, tourId, boatTourId y tourPackageId. El contrato existente de create-booking recibe boatId, tourId y tourPackageId; su funcion SQL vigente valida la pertenencia del paquete al BoatTour y almacena el boat_tour_id exacto. No se cambio ese contrato ni ninguna funcion del backend. Las pruebas verifican el payload real de creacion desde Boat A y Boat B y el boatTourId de las solicitudes de precio.

## 8. Estado dependiente

Cambiar bote limpia el packageId en el modal. En BookingPanel, cambiar bote/asociacion/paquete limpia comida y horario anterior, revalida/reselecciona un horario permitido, restablece personas incluidas y limpia reserva creada, estado de pago, resultado/error/informacion de PayPal, aviso de exito, modal de revision y validaciones. El calculo y la disponibilidad se consultan con las nuevas claves. Datos de cliente, fecha y ubicacion global de salida se conservan porque no pertenecen al paquete. Abrir de nuevo un modal inicia una nueva sesion, manteniendo las animaciones de apertura y cierre.

## 9. Validacion ejecutada

- npm.cmd run typecheck: correcto.
- npm.cmd run build: correcto, incluyendo metadata SEO.
- npm.cmd run test:catalog: agrupacion de dominio y 10 pruebas de navegador correctas (desktop y 375 px).
- npm.cmd run test:packages: pruebas PostgreSQL locales aisladas y 2 pruebas de editor/reserva correctas.
- git diff --check: correcto; solo avisos normales de conversion LF/CRLF en Windows.
- No existe comando lint en package.json.

Se verificaron: un bote; varios botes; precios distintos; un bote sin paquetes validos; tours distintos en la misma categoria; catalogo vacio; cambio de bote con paquete/comida elegidos; filtro y regreso a Todos; cierre/reapertura y otro tour; reserva desde distintos botes; navegacion horizontal y ancho responsive.

## 10. Limites y riesgos

No se crearon migraciones, no se modificaron relaciones, precios, foreign keys, funciones Supabase ni reservas existentes. Un tour sin paquetes reservables no produce una tarjeta con precio inventado. Los paquetes de cotizacion personalizada no aportan un precio From ni aparecen como paquetes con pago directo. La disponibilidad por fecha puede cambiar y se sigue validando en el backend al reservar.

Las reservas usadas por las pruebas de navegador fueron interceptadas: no se crearon reservas reales. PGlite ejecuto SQL ya existente en una base temporal local, sin aplicar migraciones en Supabase. Las comprobaciones en produccion deben ser solo de lectura y seleccion, sin confirmar una reserva.
