# Video del hero: calidad y reproduccion en celular

## Hallazgos

La compresion anterior redujo el video de celular de 1920x1080 a 960x540 y de aproximadamente 30 a 24 fps. El original pesa 18038056 bytes. El reproductor mostraba el video en loadeddata, aunque el navegador no hubiese iniciado la reproduccion; en ese caso podia quedar visible el video pausado y el control nativo de inicio.

## Cambios

- src/components/home/Hero.tsx: actualiza solamente las rutas de assets propios v1 hacia v2, sin modificar videos personalizados ni configuracion de Supabase; establece muted/defaultMuted e inline antes de play(); oculta controles del fondo y muestra el video solamente en playing. Ante bloqueo de autoplay mantiene el poster y reintenta en una interaccion normal de la pagina o al volver a ella. Limpia listeners al cambiar el video. Conserva un reproductor y reduced-motion. Corrige text-white/78 a text-white/80 para aplicar el blanco previsto al subtitulo.
- public/videos/hero-papagayo-desktop-v2.mp4: 8398152 bytes, 1920x1080, 30 fps, H.264, sin audio, fast-start.
- public/videos/hero-papagayo-mobile-v2.mp4: 5794999 bytes, 1920x1080, 30 fps, H.264, sin audio, fast-start.
- public/images/hero-papagayo-poster-v2.webp: primer fotograma del original, 1920x1080, calidad WebP 85.
- vercel.json: cache inmutable para assets v2; se mantienen assets v1 y sus URLs.
- tests/hero/hero.spec.ts, media.mjs, playwright.config.ts y server.mjs: pruebas de carga, inicio automatico, bloqueo simulado, error real HTTP, reduced-motion y conservacion de URLs personalizadas. El servidor de prueba entrega rangos HTTP reales; WebKit de Windows no intercepta estos medios con page.route en las pruebas observadas.

## Calidad y peso

Se vuelve a generar desde el MOV original, sin ampliar el video previamente comprimido. Desktop usa CRF 21 / maxrate 6500k; mobile CRF 23 / maxrate 4500k, preset medium, pix_fmt yuv420p, sin pista de audio y +faststart. Ambos conservan resolucion Full HD y 30 fps.

Desktop pesa aproximadamente 53% menos que el original; mobile aproximadamente 68% menos. Pesan mas que los archivos v1 porque esta revision prioriza mayor detalle y fluidez. Se mantiene el poster para que la pagina sea util mientras el video carga.

## Validacion

- TypeScript y build correctos.
- test:hero: 15 pruebas correctas en Chrome desktop, Chrome movil y WebKit con viewport iPhone 13.
- Los MP4 se verifican directamente como 1920x1080 y con moov antes de mdat. Chrome confirma dimensiones decodificadas 1920; WebKit de Windows reporta un tamano de decoder diferente y se verifica que tiene fotogramas y reproduccion activa, no se afirma que sea un iPhone fisico.
- Se verifican muted, playsinline, ausencia de controles y avance de currentTime sin pulsar Play.
- Autoplay bloqueado simulado: poster visible, video transparente, sin boton Play; una interaccion normal reanuda la reproduccion cuando el navegador lo permite.

## Limites

Una pagina no puede obligar al navegador a permitir autoplay. Si la politica del telefono lo impide, permanece la imagen de fondo sin pedir Play. La validacion WebKit se hizo en Windows con emulacion de viewport; no se dispone de un iPhone fisico en esta sesion. No se modifico la base de datos ni se aplicaron migraciones.

Politica de referencia: https://webkit.org/blog/6784/new-video-policies-for-ios/
