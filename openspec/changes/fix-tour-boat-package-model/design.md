# Diseño: lógica completa de la relación Tour ↔ Paquete ↔ Bote

> Documento de referencia del estado **actual** del modelo (código en `feature/storage-staging-test`).
> Sirve para ubicar el error antes de tocar código. No propone la solución todavía.

## 1. Entidades y tablas

| Concepto | Tabla | PK | Notas |
|---|---|---|---|
| Bote (embarcación física) | `public.boats` | `id text` | `max_guests` = capacidad física. `included_guests`, `extra_guest_price`, `base_price_label` están **deprecadas para precios** (solo compatibilidad histórica). `active`, `sort_order`. |
| Tour (la experiencia: Fishing, Snorkeling, Surfing, Bioluminescence, Water Toys) | `public.tours` | `id text` | `category`, `publication_status ∈ {draft, published, inactive}`. `active` se **deriva por trigger** de `publication_status` (`tours_sync_publication_status`): `active = (publication_status = 'published')`. |
| Relación Bote–Tour | `public.boat_tours` | `id uuid` | FK `boat_id → boats(id) ON DELETE CASCADE`, `tour_id → tours(id) ON DELETE CASCADE`. `unique(boat_id, tour_id)`. `active` se **deriva por trigger** (`tour_packages_sync_boat_tour_active`): `active = EXISTS(tour_packages activo con ese boat_tour_id)`. |
| Paquete (condiciones comerciales de una combinación Tour+Bote) | `public.tour_packages` | `id text` | FK `boat_tour_id → boat_tours(id) ON DELETE CASCADE`. **Única fuente de verdad** de: `base_price`, `included_guests`, `max_guests`, `extra_guest_price`, `custom_quote`, `duration_minutes`. `active`, `sort_order`, `package_type`, `name`. |
| Salidas | `public.departure_locations` | `id uuid` | `surcharge_amount`, `is_default`, `active`. Independiente de tour/bote. |
| Reserva | `public.bookings` | `id uuid` | Guarda **todas** las FK: `boat_id`, `tour_id`, `boat_tour_id`, `tour_package_id`, `time_slot_id`, `departure_location_id` + snapshots de precio. **Todas las FK son `NOT NULL` y sin `ON DELETE` (⇒ `NO ACTION` / restrict).** |

### Cardinalidad real del modelo

```
tours (1) ──< boat_tours >── (1) boats
                  │
                  │ (1)
                  ▼
             tour_packages (N)
```

- Un `tour` puede ofrecerse en **varios botes** → varias filas `boat_tours` con el mismo `tour_id`.
- Cada `boat_tour` (par bote+tour) puede tener **varios paquetes** (`Half Day`, `Full Day`, …).
- Un paquete pertenece a **un** `boat_tour`, es decir a **un bote y un tour concretos**.
- Migración de fuente de verdad: `202608260003_commercial_source_of_truth.sql`.

## 2. Triggers que mantienen `active`

| Trigger | Tabla | Efecto |
|---|---|---|
| `tours_sync_publication_status` (BEFORE INSERT/UPDATE OF publication_status) | `tours` | `new.active = (new.publication_status = 'published')` |
| `tour_packages_sync_boat_tour_active` (AFTER INSERT/DELETE/UPDATE OF active, boat_tour_id) | `tour_packages` | Recalcula `boat_tours.active` del `boat_tour_id` afectado: `true` si existe ≥1 paquete activo. |
| `ensure_single_default_departure_location` | `departure_locations` | Solo una `is_default = true`. |
| `prevent_departure_location_delete_with_bookings` | `departure_locations` | Bloquea `DELETE` si hay bookings que la referencian. **No existe protección equivalente para `boats`, `tours`, `boat_tours`, `tour_packages`.** |

**Consecuencia:** nadie escribe `boat_tours.active` a mano. Depende 100% de que el trigger de `tour_packages` haya corrido. `boat_tours` insertado sin paquetes queda `active = false`.

## 3. Lectura: cómo el frontend aplana el modelo

### `getActiveBoatTours()` — `src/services/boatTourService.ts:16`

```
tour_packages
  .select('*, boat_tours!inner(id, boat_id, tour_id, active, tours!inner(*))')
  .eq('active', true)                       -- paquete activo
  .eq('boat_tours.active', true)            -- relación activa
  .eq('boat_tours.tours.active', true)      -- tour publicado
  .order('sort_order')
```

`mapBoatTour()` (`src/services/catalogMappers.ts:37`) produce un objeto `BoatTour` **por paquete**:

| Campo `BoatTour` | Origen | Comentario |
|---|---|---|
| `id` | `tour_packages.id` | **En el frontend, "un tour" ES un paquete.** |
| `boatId` | `boat_tours.boat_id` | |
| `tourId` | `boat_tours.tour_id` | |
| `boatTourId` | `boat_tours.id` | |
| `tourTitle` | `tours.title` | |
| `name` | `tour_packages.name` | ej. "Fishing Tour - Half Day" |
| `category` | `tours.category` (normalizada) | `Bioluminescence` → `Basic`/`Deluxe` según nombre del paquete |
| `basePrice`, `includedGuests`, `maxGuests`, `extraGuestPrice`, `customQuote` | `tour_packages.*` | fuente de verdad |
| `timeSlots` | `getActiveTimeSlots()` global | **no** están ligados a tour ni paquete; misma lista para todos |

### Lo que NO valida la query de catálogo

- **No filtra `boats.active`.** `boats` ni siquiera está en el `select`. Un paquete cuyo bote fue desactivado **sigue apareciendo** en el catálogo público.
- `calculate-booking-price` (ver §4) **sí** exige `boat_tours.boats.active = true`. → Un paquete visible en la UI puede fallar con 404 al calcular precio.

### Consumo en páginas

`HomePage.tsx` / `ToursPage.tsx`:
- `boatsQuery` = `getActiveBoats()` (filtra `active`).
- `toursQuery` = `getActiveBoatTours()`.
- `catalogTours = toursQuery.data?.length ? toursQuery.data : boatTours` (fallback a data estática `src/data/boatTours.ts`).
- `selectedTourId` guarda `tour.id` = **id del paquete**.
- `availableTours = tours.filter(t => t.boatId === selectedBoat.id)` — filtra paquetes por bote seleccionado.
- `toursWithKnownBoats` filtra paquetes cuyo `boatId` no está en `catalogBoats` (defensa contra el punto anterior; solo para el carrusel).

`BookingPanel.tsx`:
- `activeStep`: 0 Bote · 1 Detalles del tour · 2 Lugar de salida · 3 Datos y pago.
- `bookingPrice` query key: `[boat.id, tour.tourId, tour.id, guests, departureLocationId]`.
- Payload a `calculate-booking-price`: `tourId: selectedTour?.tourId ?? selectedTour?.category ?? ''` — **si falta `tourId` cae al string de categoría** (`'Fishing'`), que no matchea `boat_tours.tour_id` ⇒ 400 "Tour package does not belong to tour". Solo seguro porque los tours de BD siempre traen `tourId`.
- `effectiveMaxGuests = priceQuery.data?.max_guests ?? getEffectiveMaxGuests(...)`.

## 4. Precio: `supabase/functions/calculate-booking-price/index.ts`

Entrada: `{ tourPackageId, guests, boatId, tourId?, departureLocationId?, extras[] }`.

```
tour_packages
  .select('id, boat_tour_id, base_price, included_guests, max_guests, extra_guest_price, custom_quote,
           boat_tours!inner(boat_id, tour_id, active,
             boats!inner(active, max_guests),
             tours!inner(active))')
  .eq('id', tourPackageId).eq('active', true)
  .eq('boat_tours.boat_id', boatId)
  .eq('boat_tours.active', true)
  .eq('boat_tours.boats.active', true)     -- ⚠️ el catálogo NO lo exige
  .eq('boat_tours.tours.active', true)
  .single()
```

Validaciones adicionales:
- `boatTour.boat_id !== boatId` → 400.
- `tourId` presente y `boatTour.tour_id !== tourId` → 400.
- **`effectiveMaxGuests = min(pkg.max_guests, boat.max_guests)`**; `guests > effectiveMaxGuests` → 400.
- `custom_quote` → `{ custom_quote: true, total: null }`.

Cálculo:
```
extraGuests      = max(guests - pkg.included_guests, 0)
extraGuestsTotal = extraGuests * pkg.extra_guest_price
departureSurcharge = departure_locations.surcharge_amount (si active) | 0
total = pkg.base_price + extraGuestsTotal + extrasTotal + departureSurcharge
```

## 5. Creación de reserva

### `supabase/functions/create-booking/index.ts` (público)
Zod: `paymentMethodKey ∈ {paypal, whatsapp-link, pay-on-day}`, `departureLocationId` obligatorio, rate-limit por IP, Turnstile, luego `rpc('create_booking_transaction', { payload })`.

### `supabase/functions/admin-create-booking/index.ts` (nuevo, admin)
- Zod: `paymentMethodKey ∈ {whatsapp-link, pay-on-day}` (default `whatsapp-link`), + `markAsPaid`, `adminNote`. **Sin Turnstile, sin rate-limit.**
- Verifica sesión: `auth.getUser(token)` + `profiles.role ∈ {admin, editor} AND profiles.active`.
- Llama **directo** a `rpc('create_booking_transaction')` — **no pasa por `calculate-booking-price`**.
- Si `markAsPaid` → `rpc('update_booking_status', confirmed/paid)`.

### RPC `create_booking_transaction(payload jsonb)` — `202609010001_departure_locations.sql`
`SECURITY DEFINER`. Recibe `boatId, tourId, tourPackageId, tourDate, timeSlotId, guests, departureLocationId, paymentMethodKey, extras[]`.

Secuencia de resolución Tour/Bote/Paquete:
1. `departureLocationId` no nulo y `departure_locations` activa → si no, error.
2. `tourDate >= current_date`, `guests > 0`.
3. `EXISTS boats WHERE id = boatId AND active` → si no, `boat is not available`.
4. `EXISTS tours WHERE id = tourId AND active` → si no, `tour is not available`.
5. `EXISTS time_slots WHERE id = timeSlotId AND active`.
6. `EXISTS payment_methods WHERE key = paymentMethodKey AND active`.
7. `boat_tours WHERE boat_id = boatId AND tour_id = tourId AND active = true LIMIT 1` → `v_boat_tour`; si nulo → **`boat does not offer selected tour`**.
8. `tour_packages WHERE id = tourPackageId AND boat_tour_id = v_boat_tour.id AND active = true` → `v_package`; si nulo → **`tour package is not available for selected boat and tour`**.
9. `v_package.custom_quote` → error (`requiere manejo manual`).
10. **`guests > v_package.max_guests` → `guest quantity exceeds capacity`.** ⚠️ **Solo compara contra el paquete, NO contra `boats.max_guests`** (a diferencia de `calculate-booking-price`).

Total (recomputado en servidor, no confía en el browser):
```
v_total = v_package.base_price
        + extra_guests_total
        + extras_total
        + v_departure_location.surcharge_amount
```

Estado inicial según método:
| `paymentMethodKey` | `payment_status` | `booking_status` | `expires_at` |
|---|---|---|---|
| `paypal` | `pending` | `pending_payment` | `now() + app.paypal_hold_minutes` (def. 30) |
| `whatsapp-link` | `pending` | `pending_payment` | `null` |
| `pay-on-day` | `not_required_yet` | `pending_confirmation` | `null` |
| otro | `pending` | `pending_payment` | `null` |

Escribe `bookings` con todos los snapshots + fila en `availability_blocks (boat_id, tour_date, time_slot_id)` con `unique` → colisión = `selected boat, date and time slot is already reserved` (23505 → HTTP 409).

Grants: `REVOKE ALL … FROM public; GRANT EXECUTE … TO service_role` (solo edge functions).

## 6. Escritura desde admin

### `AdminToursPage.tsx` — editor por Tour (pestaña "Paquetes")
Modelo del editor (`TourEditor`):
- **`boatId: string` — UN SOLO bote por tour.** `createEditor()` lo deriva de `firstRelation` = primera `boat_tours` del tour que tenga paquetes (o la primera que exista). `src/pages/admin/AdminToursPage.tsx:103`.
- `packages: EditablePackage[]` — en `openEditor()` se cargan **TODOS los paquetes de TODAS las `boat_tours` de ese tour** (`packageRows.filter(p => tourRelations.some(r => r.id === p.boat_tour_id))`, línea 172), sin importar el bote. Cada `EditablePackage` conserva su `boatTourId` real.

`ensureBoatTour(tourId, boatId)` (línea 210): busca/crea `boat_tours` para `(tourId, editing.boatId)`; inserta con `active: false`.

`persistPackage(item)` (línea 245):
```
const boatTourId = await ensureBoatTour(editing.id, editing.boatId);   // ⚠️ ignora item.boatTourId
supabase.from('tour_packages').upsert({
  id: item.id,
  boat_tour_id: boatTourId,                                            // ⚠️ reasigna al bote del editor
  max_guests: Math.max(includedGuests, Math.min(item.maxGuests, boat.max_guests)),
  ...
});
```

`persistPackage` **siempre** escribe `boat_tour_id = boat_tour del `editing.boatId`**, no el `item.boatTourId` original.

`deletePackage` (línea 328): `DELETE FROM tour_packages WHERE id = item.id` — **hard delete**, sin comprobar bookings que lo referencien.

`finalizeTour` (~línea 279): `tours.update({ publication_status: 'published', active: true, ... })`.

### `AdminBoatToursPage.tsx`
**Solo lectura.** Vista de todos los paquetes con su bote/tour. El botón "Editar" navega a `/admin/tours?tourId=...&tab=packages`. Comentario explícito: la edición vive únicamente en la pestaña Paquetes del tour "para evitar dos editores divergentes".

### `AdminBoatsPage.tsx`
CRUD de `boats`. `DELETE FROM boats WHERE id = ...` (línea 300) y también "desactivar en vez de borrar" (línea 329). El hard delete **cascadea** a `boat_tours` → `tour_packages` (ON DELETE CASCADE), pero chocará con las FK `NO ACTION` de `bookings` si alguna reserva referencia esas filas.

### `AdminReservationsPage.tsx` (modal "Crear reserva manual", nuevo)
- `manualForm.tourPackageId` = `BoatTour.id` (id de paquete).
- `manualTotalPreview` se calcula **en el cliente**: `selectedTour.basePrice + max(0, guests - includedGuests) * extraGuestPrice + location.surcharge_amount`. Es solo estimación; el total real lo recomputa la RPC.
- `guests` input: `max={selectedTour?.maxGuests ?? 30}` — **usa el max del paquete, no el del bote.**
- Envía a `adminCreateBooking` con `boatId: selectedTour.boatId`, `tourId: selectedTour.tourId`, `tourPackageId: selectedTour.id`, `paymentMethodKey: 'whatsapp-link'`.

## 7. Inconsistencias detectadas (candidatos al "error")

### A. El editor de admin no representa tours multi-bote — **puede migrar paquetes de bote silenciosamente**
`AdminToursPage`: `TourEditor.boatId` es único, pero `editor.packages` incluye paquetes de **todas** las `boat_tours` del tour. Al guardar cualquier paquete, `persistPackage` usa `ensureBoatTour(tour.id, editing.boatId)` e ignora `item.boatTourId`. Si un tour se ofrece en el bote A y el bote B:
- `editor.boatId` resuelve a **uno** de los dos.
- Editar y guardar un paquete del otro bote **reescribe su `boat_tour_id`** al bote del editor.
- El paquete "se muda" de bote, `max_guests` se re-clampa a la capacidad del bote nuevo, y el trigger puede voltear `boat_tours.active` de ambos lados.
- El lado de lectura (`getActiveBoatTours`, `create_booking_transaction`) **sí** soporta multi-bote, así que el modelo de datos y el editor están desalineados.

Efecto visible probable: "cambié el precio/capacidad de un paquete y desaparecieron paquetes de otro bote" o "un paquete quedó bajo el bote equivocado".

### B. `boats.active` no se valida en el catálogo pero sí en el precio
`getActiveBoatTours` no filtra `boats.active`; `calculate-booking-price` exige `boat_tours.boats.active = true`. Un paquete de un bote desactivado aparece reservable y falla con **404 "Tour package not found"** al llegar al paso de precio.

### C. Tope de capacidad distinto entre precio y creación
- `calculate-booking-price`: `guests ≤ min(package.max_guests, boat.max_guests)`.
- `create_booking_transaction`: `guests ≤ package.max_guests` (ignora el bote).
- `AdminReservationsPage` modal: `max = package.max_guests`.
Si `package.max_guests > boat.max_guests` (dato viejo, o `boats.max_guests` reducido después), **`admin-create-booking` puede sobrevender la capacidad física** porque no pasa por `calculate-booking-price`.

### D. `admin-create-booking` no recalcula ni valida contra el precio del servidor
Va directo a la RPC. La RPC sí recomputa el total, pero **no** aplica el tope del bote (punto C) ni la validación `tourId` vs `boat_tours.tour_id` cruzada que sí hace `calculate-booking-price`. Menos defensa en profundidad para reservas manuales.

### E. Borrado duro sin protección de FK
`deletePackage` (`tour_packages`) y el delete de `boats` hacen `DELETE` directo. `bookings` tiene FK `NOT NULL` `NO ACTION` a `tour_package_id` y `boat_tour_id`. Con reservas existentes el borrado falla con violación de FK y el admin ve el error crudo de Postgres. Sólo `departure_locations` tiene trigger de protección.

### F. Fallback de `tourId` a categoría en `BookingPanel`
`tourId: selectedTour?.tourId ?? selectedTour?.category ?? ''`. Para datos de BD siempre hay `tourId`; para el fallback estático `src/data/boatTours.ts` los `tourId` son slugs (`'fishing'`) que no existen en `tours` → si ese fallback llega a `calculate-booking-price` da 400/404.

### G. `time_slots` global, no por tour/paquete
Todos los paquetes muestran la misma lista de horarios activos. `src/data/boatTours.ts` sí tiene `timeSlots` por paquete, pero la versión de BD los ignora. Si el negocio necesita horarios distintos por tour, hoy no se modela.

## 8. Preguntas abiertas antes de decidir el fix

1. ¿Un tour **debe** poder ofrecerse en varios botes, o la regla de negocio real es "1 tour = 1 bote"? Esto define si se arregla el editor (soportar multi-bote) o el modelo (constraint `unique(tour_id)` en `boat_tours` + simplificar).
2. ¿La capacidad que manda es la del **paquete** o la del **bote**? Unificar A/C/D alrededor de una sola regla.
3. ¿Reservas manuales de admin deben pasar por `calculate-booking-price` (una sola ruta de precio) o quedarse con la RPC directa?
4. ¿Botes/tours/paquetes con reservas se **desactivan** siempre (nunca `DELETE`)? Entonces añadir triggers de protección equivalentes a `departure_locations`.
