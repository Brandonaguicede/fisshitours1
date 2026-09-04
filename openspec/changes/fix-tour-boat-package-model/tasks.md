# Tasks

## 1. Investigación (completo)
- [x] Documentar el modelo completo en `design.md`.
- [x] Listar inconsistencias candidatas (`design.md` §7).
- [x] Confirmar con el usuario cuál es el error reproducible: A (editor mono-bote reasigna
      paquetes de bote al guardar) confirmado en código; no reproducible con el seed actual
      porque solo existía un bote — se activa en cuanto se registre un 2º bote.
- [x] Responder las preguntas de negocio de `design.md` §8:
      1. Multi-bote se preserva (no se fuerza 1 tour = 1 bote).
      2. Capacidad manda `min(package.max_guests, boats.max_guests)`.
      3. Reservas de admin se quedan en la RPC directa, pero la RPC se endureció con la
         misma regla de capacidad (no se agregó una segunda ruta de precio).
      4. Botes/tours/boat_tours/tour_packages con reservas se desactivan, nunca se borran
         (triggers de protección).

## 2. Fix (implementado)
- [x] Migración `202609040001_boat_centric_capacity_and_guards.sql`:
      - `create_booking_transaction` valida `least(package.max_guests, boats.max_guests)`.
      - `sync_boat_tour_active_from_packages` resincroniza origen y destino al mover un
        paquete de relación (antes solo resincronizaba el destino).
      - Triggers `prevent_{boat,tour,boat_tour,tour_package}_delete_with_bookings`.
- [x] Nuevo `src/services/adminBoatToursService.ts` + `src/components/admin/BoatToursPackagesEditor.tsx`:
      escritura de paquetes siempre resuelve `boat_tour_id` desde `(boatId, tourId)` en
      edición — un paquete ya no puede migrar de bote.
- [x] `AdminBoatsPage.tsx`: pestaña "Tours y paquetes" (deep-link `?boatId=`).
- [x] `AdminToursPage.tsx`: ya no escribe paquetes; paso "Paquetes" es solo lectura y enlaza
      al bote dueño. Se agregaron acciones de activar/desactivar y eliminar tour (bug aparte
      encontrado durante las pruebas: no existía forma de despublicar ni de borrar un tour).
- [x] `AdminBoatToursPage.tsx`: enlaza al bote en vez de al tour.
- [x] `getActiveBoatTours` exige `boats.active = true`.
- [x] `AdminReservationsPage.tsx` y `BookingPanel.tsx`: mismo tope `min(package, boat)`;
      eliminado el fallback `tourId ?? category` en la escritura.
- [x] Fix aparte (bug preexistente, no relacionado al modelo comercial): la Galería de
      Tours subía fotos con `resourceTable="tour_images"`, tabla nunca permitida por
      `storage-upload-image` → siempre fallaba con "Invalid resource association". Se
      corrigió a `resourceTable="tours"`.
- [x] Tests nuevos en `tests/e2e/backend.spec.ts` (capacidad en ambas rutas de reserva,
      bote inactivo, resync del trigger, guardia de borrado).
- [ ] Aplicar `202609040001` (y la `202609020004` de PayPal, restaurada en el mismo tramo
      de trabajo) al proyecto Supabase remoto con `supabase db push` — pendiente de
      confirmación explícita antes de tocar producción.
- [ ] Ejecutar la suite e2e completa contra Supabase local (bloqueado en esta sesión por
      arranque lento de Docker; la migración sí se validó con `supabase db reset` limpio).

## 3. Confirmación de la regla crítica
- [x] Editar los paquetes de un bote no puede alterar los paquetes de otro bote: la única
      ruta de escritura (`savePackageForBoatTour`) resuelve `boat_tour_id` del par
      `(boatId, tourId)` en edición; `AdminToursPage` ya no escribe paquetes.
