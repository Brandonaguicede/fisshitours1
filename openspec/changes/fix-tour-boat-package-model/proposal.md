## Why

El modelo Tour ↔ Paquete ↔ Bote tiene desalineaciones entre lo que soporta la base de datos, lo que valida el cálculo de precio y lo que permite editar el admin. Hay al menos un error reproducible relacionado con esto (por confirmar cuál de los candidatos del `design.md`). Antes de cambiar código se documenta toda la lógica actual.

## What Changes

- **Solo documentación por ahora.** `design.md` describe el estado actual completo: tablas, triggers, aplanado del frontend, validaciones de precio y de `create_booking_transaction`, y los editores de admin.
- `design.md` §7 lista las inconsistencias detectadas (candidatas al error).
- `design.md` §8 lista las decisiones de negocio pendientes que definen el fix.
- Los cambios de código se definirán tras confirmar el error concreto y responder §8.

## Non-Goals

- No se toca código ni migraciones en este paso.
- No se decide todavía si "1 tour = 1 bote" o multi-bote.
