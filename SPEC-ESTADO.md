# Spec — Estado de lógica del proyecto `fisshitours1`

> Fecha: 05-09-2026 · Rama actual: `main` (HEAD `7ac7cf1`)

## 1. Vista general

Proyecto: **Papagayo Fishing Tours** — SPA de reservas para charters de pesca en Papagayo, Costa Rica.
Stack: React 18 + TypeScript + Vite + Tailwind + react-router v6 + React Query + react-hook-form/zod. Backend: funciones serverless de Vercel (`api/paypal`). Sin base de datos en esta rama (todo estático).

**Estado global (rama `main`): ~75% lógico funcional.** El flujo público de reserva funciona de punta a punta; falta persistencia, administración, formulario de contacto real y limpieza de componentes muertos.

> ⚠️ **Contexto importante:** la rama `feature/storage-staging-test` (80+ commits adelante) contiene el panel admin + Supabase + edge functions, que NO están en el checkout actual. Este spec describe la rama `main`.

---

## 2. Módulos y % de completado

| # | Módulo | % | Estado |
|---|--------|---|--------|
| 1 | Páginas públicas (Home, Tours, Detalle, Nosotros, Contacto, 404) | 90% | Funcional, faltan retoques |
| 2 | Motor de reservas (`BookingPanel`) | 85% | Wizard 3 pasos completo, falta persistencia |
| 3 | Lógica de precios (`bookingPricing`) | 100% | Base 5 pax + $65 extra, máx 10, 50% depósito |
| 4 | Pago PayPal (cliente + serverless) | 90% | Flujo create/capture completo, falta validación en frío (store in-memory) |
| 5 | Pago por WhatsApp | 90% | Generación de mensaje `wa.me` con datos de reserva |
| 6 | i18n ES/EN | 85% | Persistencia localStorage, faltan textos sueltos |
| 7 | Catálogo de datos estáticos | 80% | Turistas correctos, hay imágenes placeholder |
| 8 | Contacto (formulario) | 20% | NO envía: solo `console.info` y reset |
| 9 | Persistencia / backend | 0% | Todo en memoria/estático. Sin BD, sin admin |
| 10 | Panel de administración | 0% | Existe solo en `feature/storage-staging-test` |
| 11 | Disponibilidad en tiempo real | 0% | Copy dice "confirmación <2h" pero no hay lógica |

---

## 3. Desglose por módulo

### 3.1 Páginas públicas — 90%
- Rutas: `/` → Home, `/tours` → ToursPage, `/tours/:slug` → TourDetailPage, `/nosotros`, `/contacto`, `*` → NotFound.
- Detalle de tour **solo funciona para los 5 tours legacy** de `data/tours.ts`. Los 14 paquetes de `data/boatTours.ts` no tienen ruta de detalle propia.
- **Pendiente:** páginas de detalle por paquete de barco, pulir copy.

### 3.2 Motor de reservas (`BookingPanel.tsx`, ~1035 líneas) — 85%
- Wizard 3 pasos: Barco → Datos del tour (tipo → paquete → fecha → huéspedes → franja horaria, comida opcional en día completo) → Datos del cliente → Pago.
- 3 métodos de pago: PayPal (SDK + serverless), solicitar link por WhatsApp, pagar el día.
- **Pendiente:** validación de disponibilidad real, persistencia de la reserva, CRUD de reservas.

### 3.3 Precios (`bookingPricing.ts`) — 100%
- Fórmula única completa: precio base cubre 5 huéspedes; cada extra ($65) hasta máx 10; depósito 50%.
- Rango de precios por paquete: $600–$1150.

### 3.4 PayPal — 90%
- Cliente: `paypalService.ts` (carga SDK, crea/captura órdenes).
- Server: `api/paypal/` — `create-order.js`, `capture-order.js`, `catalog.js` (precios validados server-side), `paypalClient.js` (OAuth).
- Validaciones: monto/divisa, re-cálculo server-side, anti doble-captura (store en memoria → se pierde en cold starts).
- **Pendiente:** estado persistente de órdenes (limitar el anti-doble-captura con persistencia).

### 3.5 WhatsApp — 90%
- `bookingPayment.ts` arma el mensaje con todos los datos y abre `wa.me`.
- **Pendiente:** confirmación automática / webhook de estado.

### 3.6 i18n — 85%
- `LanguageContext` + `translations.ts` + `content.ts`; persistencia en localStorage.
- **Pendiente:** revisar textos sin traducir ocultos en componentes.

### 3.7 Datos estáticos — 80%
- 1 barco ("Second Wind", 32ft Cigarette / Yamaha 250HP), 14 paquetes, galería, testimonios, destinos, horarios.
- **Pendiente:** reemplazar placeholders (bioluminiscencia x2, destinos x5, CTA).

### 3.8 Contacto — 20%
- Formulario con zod + react-hook-form **pero `onSubmit` solo hace `console.info`** y reset. El éxito es fake.
- Campo teléfono sin registrar en el schema/form.

---

## 4. Código muerto / huérfano en `src/components/home/`

| Componente | Estado |
|---|---|
| `Hero`, `FleetSection`, `TourCarouselSection`, `GallerySection`, `AboutPreview` | Usados en HomePage |
| `Benefits`, `CTA`, `Destinations`, `FeaturedTours`, `Testimonials` | Orfanos (no importados en ningún lado) |
| `components/tours/TourCard.tsx` | Solo usado por `FeaturedTours` (huérfano) |

---

## 5. Servicios

| Servicio | Estado |
|---|---|
| `tourService.ts` | **Stub:** `getTours/getTourBySlug` devuelven arrays estáticos con `Promise.resolve` |
| `paypalService.ts` | Funcional, carga SDK y maneja órdenes |

---

## 6. Configuración / despliegue

- `vercel.json`: rewrites SPA + passthrough `/api`. ✅
- `.env` **ausente** → PayPal y WhatsApp requieren vars: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `VITE_PAYPAL_CLIENT_ID`, `VITE_WHATSAPP_NUMBER`.
- `node_modules` no instalado → `npm run typecheck` falla hoy.
- `package-lock.json` (npm) + `pnpm-lock.yaml` → se usaron ambos gestores; `pnpm-workspace.yaml` tiene un valor inválido (`allowBuilds: esbuild`).

---

## 7. Prioridad de pendientes (sugerencia)

1. **Persistir reservas** (fix crítico para negocio real) — idealmente migrar a `feature/storage-staging-test`.
2. Formulario de contacto conectado (email o servicio).
3. Reemplazar placeholders de imágenes.
4. Eliminar componentes huérfanos.
5. Páginas de detalle para los 14 paquetes de barco.
6. Lint/typecheck verdes (`npm i && npm run typecheck`).
7. Consolidar a un solo gestor de paquetes.

---

## 8. Conclusión

La **lógica de cara al cliente está prácticamente completa** (reserva → precio → pago PayPal/WhatsApp → mensaje). Lo que falta es toda la **lógica de negocio tras bambalinas**: base de datos, administración, disponibilidad y persistencia. Esa parte ya existe desarrollada en la rama `feature/storage-staging-test` y está pendiente de integrarse a `main`.

---

## 9. Roadmap a 100% (alcance aprobado: completar rama `main`)

> Aprobado por el usuario el 05-09-2026. Sin BD ni admin en esta fase; la persistencia operativa sigue el flujo PayPal + WhatsApp ya consolidado.

| # | Tarea | Estado | Implementación |
|---|-------|--------|----------------|
| 1 | **Formulario de contacto real** | ✅ Hecho | `api/contact.js` (serverless) + `services/contactService.ts`; ContactPage envía vía API y abre WhatsApp con el mensaje compuesto; se registra el campo teléfono |
| 2 | **Detalle para los 14 paquetes de barco** | ✅ Hecho | `tourService` resuelve también `boatTours`; `TourDetailPage` renderiza Tour y BoatTour; enlace "Ver detalle" en `BoatTourCard`; preselección por `location.state` |
| 3 | **Eliminar código muerto** | ✅ Hecho | Borrados `Benefits`, `CTA`, `Destinations`, `FeaturedTours`, `Testimonials`, `TourCard` + `data/destinations`, `data/testimonials` + sus types |
| 4 | **Reemplazar placeholders** | ✅ Hecho | Bioluminiscencia → `/galeria/IMG_9017.jpeg`; eliminado `public/images/placeholder-image.jpg` |
| 5 | **Typecheck y build verdes** | ✅ Hecho | `npm install`, `npm run typecheck` (0 errores), `npm run build` (1719 módulos, OK) |
| 6 | **Un solo gestor de paquetes** | ✅ Hecho | Eliminados `pnpm-lock.yaml` y `pnpm-workspace.yaml` (inválido); se mantiene `package-lock.json` (npm) |
| 7 | **Documentar envs** | ✅ Hecho | Creado `.env.example` con vars PayPal, WhatsApp, contacto (email via Resend) |

### 9.1 Detalle de implementación

**Tarea 1 — Contacto real**
- `api/contact.js`: valida `{ name, email, phone, tourType, departureTime, message }`; si `RESEND_API_KEY` está definida envía email (fetch a Resend) a `CONTACT_EMAIL_TO`; responde `{ ok, channel: 'email'|'whatsapp' }`.
- `src/services/contactService.ts`: `submitContactRequest()` → POST `/api/contact`; `getWhatsAppContactUrl()` → `wa.me` con mensaje.
- `ContactPage`: agrega `phone` al schema y al form; en `onSubmit` llama a `submitContactRequest()` y abre WhatsApp con el mensaje como respaldo garantizado (mismo patrón que reservas).

**Tarea 2 — Detalle de paquetes**
- `tourService.getTourBySlug` busca en `tours` (por slug) y en `boatTours` (por id). Devuelve `Tour | BoatTour | undefined`.
- `TourDetailPage` ramifica: legacy (rating/duration string) vs paquete (basePrice, horas, capacidad, timeSlots, actividades). CTA "Reservar este tour" → `/tours` con `state: { tourId }`.
- `BoatTourCard`: nuevo enlace "Ver detalle" → `/tours/${tour.id}`.
- `HomePage`/`ToursPage`: leyendo `location.state.tourId`, preseleccionan barco+paquete y hacen scroll a reserva.

**Tareas 3 y 4 — limpieza**
- Solo `BoatTourCard` queda en `components/tours` (usado por ToursPage y TourCarouselSection).
- Bioluminiscencia usa la foto real `/galeria/IMG_9017.jpeg` (agua azul profunda).
- `destinations`/`testimonials` se eliminan por completo (solo los usaban componentes huérfanos).

**Tareas 5-7 — configuración**
- `npm` como único gestor; se borran los archivos de pnpm.
- `.env.example` documenta: `VITE_WHATSAPP_NUMBER`, `VITE_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `RESEND_API_KEY`, `CONTACT_EMAIL_TO`.

### 9.2 Criterios de aceptación
1. `npm run typecheck` pasa sin errores.
2. `npm run build` genera dist sin errores.
3. Formulario de contacto envía (email si está configurado o WhatsApp siempre) y valida teléfono.
4. Cada paquete de `boatTours` tiene su página `/tours/:id` accesible desde sus tarjetas y preselecciona la reserva.
5. No quedan componentes ni datos sin usar; sin placeholders.
6. Un solo lockfile (npm).