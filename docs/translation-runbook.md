# Traducción del contenido (EN → ES) — runbook de operación

## Regla

El administrador escribe **todo el contenido comercial público en inglés**. DeepL genera el **español** (EN → ES)
en el momento de guardar. Se guardan las dos versiones:

| Versión | Dónde se guarda |
|---|---|
| Inglés (original del admin) | columna legacy + `*_en` (Hero/About: clave `*.en`) |
| Español (DeepL) | `*_es` (Hero/About: clave `*.es`) |

La landing muestra `*_en` a los visitantes en inglés y `*_es` a los visitantes en español. La UI del Admin puede estar en español;
solo el *contenido* se escribe en inglés.

## Cómo funciona (flujo real)

```
Admin (formulario, texto EN)
  → botón: Crear / Siguiente / Guardar borrador / Guardar / Guardar paquete / Guardar cambios / Guardar hero...
  → translateTextsToSpanish()  [src/services/translationService.ts]   solo lo NUEVO o CAMBIADO, un lote por guardado
      → POST  <supabase>/functions/v1/translate-texts   { texts, targetLang:'ES', sourceLang:'EN' }
          → supabase/functions/_shared/deepl.ts → DeepL
  → textColumns()/listColumns() [src/utils/bilingualContent.ts]  → EN + ES juntos
  → escritura en la base de datos
  → mapper público (catalogMappers / boatService) → getTourText / getBoatText / getPackageLabel → landing
```

Reglas de guardado (todas las pantallas):

1. Se traduce **antes** de escribir. Si DeepL falla no se guarda **nada** (ni contenido, ni precio, ni configuración) y el formulario
   conserva lo escrito para reintentar. Mensaje: «No se pudo generar la traducción al español. Intenta nuevamente.»
2. Sin cambios en el texto → no se llama a DeepL y no se escriben las columnas `_en/_es`.
3. Texto vaciado → se limpian `_en` y `_es` juntos.
4. Nunca se hace fallback `ES = EN` para poder guardar.
5. Solo se traduce al pulsar un botón de guardado/avance. Nunca al escribir, al salir del campo, al abrir un modal ni al cambiar de idioma.

## Qué se traduce (categoría A) y qué no

| Módulo | Traducible EN → ES | No se traduce |
|---|---|---|
| Tours | título, frase, descripción, actividades, «Incluye», etiquetas de inclusiones | slug, categoría, estado |
| Botes | etiqueta (`badge`), equipamiento | **nombre (nombre propio)**, largo, motor, capacidad |
| Paquetes | nombre, descripción, «Incluye» (`package_included`), comidas (`meal_options`) | precio, capacidad, horas HH:MM |
| Lugares de salida | descripción | **nombre (nombre propio)**, cargo |
| Galería | alt | título (no se muestra en la landing) |
| Hero / About | todos los textos `*.en` | botones/CTA estructurales (controlados por código) |
| Comentarios (reseñas) | flujo propio (`create-review`): conserva el idioma original del usuario | — |

`package_included`: `NULL` = hereda la lista del Tour, `[]` = vacío explícito, lista = lista propia (`_en` = original, `_es` = DeepL).

## Edge Functions

| Función | Rol | verify_jwt | Autenticación |
|---|---|---|---|
| `translate-texts` | traduce lo que el admin acaba de escribir (EN → ES). No lee ni escribe la base de datos. | `false` | valida el token **dentro** (`requireEditor`: sesión válida + perfil activo con rol `admin` o `editor`), igual que el resto de funciones de administración |
| `translate-all-site-content` | **backfill / reparación** de contenido antiguo (botón «Reparar traducciones antiguas»). No forma parte del flujo diario. | `false` | igual (`requireEditor`) |
| `create-review` / `backfill-review-translations` | traducción de comentarios de usuarios | `false` | pública / editor |

`verify_jwt=false` se usa porque las funciones validan el JWT y el rol ellas mismas (así devuelven mensajes de error en JSON con
CORS); sin token responden **401** y con un rol distinto de admin/editor **403**. Secret necesario: `DEEPL_API_KEY`
(`supabase secrets list` debe mostrarlo; nunca imprimir su valor).

`translate-texts`: 1–50 textos por petición (el cliente parte en lotes de 50), hasta 10 000 caracteres por texto y 50 000 en total,
`targetLang` `ES`/`EN`, `sourceLang` opcional (el Admin siempre envía `EN`). Errores: 400 payload inválido, 401 sin/`token` inválido,
403 rol, 405 método, 502 DeepL falló o devolvió vacío, 503 falta `DEEPL_API_KEY`.

### Despliegue

```bash
npx supabase functions deploy translate-texts            --project-ref <ref> --use-api
npx supabase functions deploy translate-all-site-content --project-ref <ref> --use-api
npx supabase functions list                               # comprobar versión y verify_jwt
```

Las dos comparten `supabase/functions/_shared/deepl.ts` (una sola integración con DeepL): al cambiarlo, redesplegar ambas.

## Reparar traducciones antiguas (backfill)

Admin → Contenido → «Reparar traducciones antiguas». Solo completa lo que **falta** (nunca sobrescribe) en contenido creado antes de esta
regla. Es la **única** parte del sistema que puede traducir ES → EN (registros antiguos que solo tienen español). Antes de ejecutarlo
conviene auditar la base con SELECT (ver abajo); si no falta nada, no hace nada.

Los registros cuyo idioma original sea ambiguo **no** se traducen automáticamente: se marcan para **revisión manual** (editarlos en el Admin
en inglés; al guardar se genera el español).

### Auditoría de datos (solo lectura)

```bash
npx supabase db query --linked --file <consulta.sql> -o json      # SOLO SELECT
```

Comprobar por tabla/campo: total, con legacy, falta `*_en`, falta `*_es`, «legacy parece español» (`legacy = *_es` y distinto de `*_en`),
desfase (`legacy` distinto de ambos). Ver el informe de cierre de esta funcionalidad para el estado a la fecha del despliegue.

## Pruebas

| Capa | Comando / archivo |
|---|---|
| Admin (todos los módulos, DeepL simulado) | `npm run test:admin` → `admin-boat-packages`, `admin-tour-wizard`, `admin-content-translation`, `admin-management-rules`… |
| Landing renderizada (Hero, About, Galería) | `tests/admin-to-landing.test.mjs` |
| Landing renderizada (Tours, paquetes, comidas, incluye, lugares de salida) | `tests/tour-catalog/i18n.spec.ts` (`npm run test:catalog`) |
| Mappers/selectores de idioma | `tests/translation-public.test.mjs`, `tests/package-included-public.test.mjs` |
| CORS de las Edge Functions | `node --test tests/cors.test.mjs` |
| Función remota real | invocar `translate-texts` con una sesión admin (sin escribir en la base de datos) |
