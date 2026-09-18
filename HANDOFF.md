# Papagayo Fishing Tours — Session Handoff

## Proyecto
- Ruta: C:\Users\chava\Desktop\fisshitours1
- Rama actual: main
- origin/main estaba actualizado al iniciar este trabajo.
- Estamos trabajando deliberadamente sobre main por ahora.
- No commit/push sin autorización explícita.

## Herramientas
- codebase-memory-mcp ya está instalado e indexado para este repo.
- Usarlo primero para arquitectura, trazas e impacto.
- Claude Desktop tiene actualmente roto device_bash por el sandbox de Windows, por eso continuamos en Claude Code.
- Claude Code sí puede ejecutar terminal.

## Problema original: imágenes de Boats
Second Wind parecía tener imágenes "quemadas".

Diagnóstico confirmado:
- localhost estaba mostrando el fallback estático de `src/data/boats.ts`
- assets físicos en `public/botes/*.jpeg`
- HomePage/ToursPage usan:
  `boatsQuery.data?.length ? boatsQuery.data : boats`
- por eso, si getActiveBoats falla o devuelve vacío, aparece el catálogo estático.
- Admin/Vercel usa datos reales de Supabase/boat_images.
- Eran dos datasets distintos.

## Regla actual de imágenes
- `boat_images` debe ser la fuente editable/canónica.
- máximo 6 imágenes por bote.
- activación válida entre 3 y 6.
- no volver a la antigua regla 3/6/9.
- no ejecutar ningún backfill legacy.
- la migración `202609110001_backfill_legacy_boat_images.sql` fue eliminada y NO debe recrearse salvo nueva decisión explícita.

## Cambio local pendiente en AdminBoatsPage.tsx
Existe modificación local que:
- marca filas legacy sintéticas con `synthetic`
- evita enviarlas a writes de boat_images
- las deja solo como preview de lectura
- corrige sort_order de nuevas imágenes usando `max(sort_order) + 1`
- actualiza regla visual a 3–6 imágenes
- eliminó referencias al backfill/migración
- NO descartar este cambio sin revisarlo primero.

## Vercel local
Se instaló Vercel CLI:
59.15.1

Repo vinculado correctamente a:
papagayo-fishingtour/fisshitours1

Se ejecutó:
`vercel env pull .env.local --environment=preview`

Vercel descargó:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- varias variables VERCEL_*
- otras variables de entorno

Vercel avisó que 3 Secret values no podían descargarse y fueron escritos como `[SENSITIVE]`.

`.env.local` existe y está ignorado por Git.

## Problema ACTUAL que falta diagnosticar

Aunque `.env.local` ya existe y contiene:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

localhost sigue:

1. mostrando las imágenes estáticas antiguas de Second Wind;
2. mostrando en Admin:
   "El panel administrativo no está configurado para iniciar sesión en este entorno."

Por tanto hay que diagnosticar exactamente por qué Supabase/Auth no están funcionando localmente.

## Próxima tarea EXACTA

Usar codebase-memory-mcp primero y después terminal real para diagnosticar:

### A. src/lib/supabase.ts
Determinar:
- cómo se calcula `isSupabaseConfigured`
- si con `.env.local` actual queda true o false
- qué validación exige
- NO mostrar secretos.

### B. getActiveBoats
Trazar:
HomePage/ToursPage
→ React Query
→ getActiveBoats()
→ Supabase

Determinar si:
A. Supabase no está configurado
B. request falla
C. 401/403/RLS
D. devuelve 0 boats
E. otro error activa fallback

No asumir.

### C. Admin
Buscar literalmente:
"El panel administrativo no está configurado para iniciar sesión en este entorno."

Determinar:
- archivo
- condición exacta
- variables necesarias
- cuál falta o es inválida.

### D. .env.local
Comprobar solo presencia/estado, nunca valores:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- demás VITE_* requeridas
- detectar cuáles quedaron `[SENSITIVE]`.

### E. Vite
Confirmar que:
- `.env.local` se carga desde la raíz correcta
- el proceso Vite actual fue iniciado después de crear `.env.local`
- no existe otro proceso viejo sirviendo el puerto.

### F. Validación en runtime
Usar terminal/browser/logs si hace falta para encontrar el error REAL de getActiveBoats.

## Restricciones
- NO modificar Supabase remoto.
- NO migraciones.
- NO backfill.
- NO commit.
- NO push.
- NO exponer secretos.
- Primero diagnóstico y reporte.
- No hacer auditoría general.

## Git working tree conocido
Había cambios locales en:
- .gitignore
- skills-lock.json
- src/pages/admin/AdminBoatsPage.tsx

Untracked:
- .claude/
- .mcp.json

La migración de backfill ya fue eliminada.

Antes de modificar cualquier cosa:
1. correr `git status`
2. correr `git diff --check`
3. revisar cambios actuales para no pisarlos.
