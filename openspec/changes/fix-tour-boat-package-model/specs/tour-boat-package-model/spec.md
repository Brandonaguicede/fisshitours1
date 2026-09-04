## ADDED Requirements

### Requirement: Invariantes del modelo Tour ↔ Paquete ↔ Bote

El sistema SHALL mantener las siguientes invariantes documentadas en `design.md`.

#### Scenario: Un paquete pertenece a un único par bote+tour

- **GIVEN** una fila en `tour_packages`
- **WHEN** se lee su `boat_tour_id`
- **THEN** apunta a exactamente una fila `boat_tours`, que fija un `boat_id` y un `tour_id`

#### Scenario: `boat_tours.active` se deriva de sus paquetes

- **GIVEN** una fila `boat_tours`
- **WHEN** cambia el `active` o el `boat_tour_id` de algún `tour_packages`
- **THEN** el trigger `tour_packages_sync_boat_tour_active` fija `boat_tours.active = EXISTS(paquete activo)`

#### Scenario: El total lo recalcula el servidor

- **GIVEN** una petición de reserva con cualquier total enviado por el browser
- **WHEN** corre `create_booking_transaction`
- **THEN** `total_snapshot = tour_packages.base_price + extra_guests_total + extras_total + departure_locations.surcharge_amount`, ignorando el valor del cliente

### Requirement: Inconsistencias conocidas pendientes de resolución

El equipo SHALL resolver, tras definir la regla de negocio, las inconsistencias listadas en `design.md` §7 (editor admin mono-bote vs modelo multi-bote, `boats.active` no validado en catálogo, tope de capacidad distinto entre precio y RPC, borrado duro sin protección de FK).

#### Scenario: Editar un paquete no debe cambiar su bote

- **GIVEN** un tour ofrecido en el bote A y el bote B con paquetes en ambos
- **WHEN** un admin edita y guarda un paquete del bote B
- **THEN** el `boat_tour_id` del paquete SHALL seguir apuntando al bote B (hoy no se cumple)
