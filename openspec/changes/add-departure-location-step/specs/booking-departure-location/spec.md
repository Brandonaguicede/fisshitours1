## ADDED Requirements

### Requirement: Required Departure Location Step

The booking flow SHALL include a required `Lugar de salida` step after tour details and before customer/payment details.

#### Scenario: User cannot continue without a location

- **GIVEN** the user has selected a boat and tour details
- **WHEN** no departure location is selected
- **THEN** the flow SHALL prevent continuing to customer/payment details

#### Scenario: Active locations are selectable

- **GIVEN** active departure locations exist
- **WHEN** the departure step loads
- **THEN** the locations SHALL be shown as accessible radio-card options ordered by `sort_order`

### Requirement: Backend-Calculated Departure Surcharge

The backend SHALL calculate the departure surcharge from `public.departure_locations` and SHALL NOT trust any surcharge amount sent by the browser.

#### Scenario: Free departure location

- **GIVEN** Playas del Coco has `surcharge_amount = 0`
- **WHEN** a booking uses Playas del Coco
- **THEN** the total SHALL not include a departure surcharge

#### Scenario: Paid departure location

- **GIVEN** Flamingo has `surcharge_amount = 50`
- **WHEN** a booking uses Flamingo
- **THEN** the total SHALL include USD 50 and the booking SHALL store departure name, surcharge, and currency snapshots

#### Scenario: Invalid location

- **GIVEN** a missing or inactive departure location id
- **WHEN** a booking is created
- **THEN** the backend SHALL reject the booking

### Requirement: Admin Departure Location Management

Administrators and editors SHALL be able to create, edit, order, default, activate, and deactivate departure locations.

#### Scenario: Existing booking protection

- **GIVEN** a departure location has associated bookings
- **WHEN** an admin attempts to delete it
- **THEN** the database SHALL reject physical deletion and the admin SHALL deactivate it instead
