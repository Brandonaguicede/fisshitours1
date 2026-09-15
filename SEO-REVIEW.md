# Revisión SEO y logo de Papagayo

Dominio confirmado por el propietario: https://www.papagayofishingtourcr.com/.

## Correcciones

- Se eliminó Pura Ruta Adventures del título y descripción iniciales.
- Se añadieron favicon PNG cuadrado de 192 px y apple-touch-icon de 180 px, derivados del logo existente sobre fondo azul para que sea visible.
- Se añadió Organization y WebSite en JSON-LD con nombre, dominio, logo de 512 px, teléfono y perfiles sociales existentes. El correo de contacto confirmado por el propietario es papagayofishingtourcr@gmail.com; se usa en Contacto, footer, marcado SEO y respaldo del formulario.
- Se añadió texto alternativo al logo de navegación, que antes estaba oculto para lectores de pantalla.
- Se añadieron canonical, metadatos sociales, robots.txt y sitemap.xml con las cuatro páginas públicas y el logo.
- Cada página pública recibe su propio título, descripción y canonical tanto al navegar como en su HTML generado al compilar. Esto genera metadatos estáticos; el contenido de React sigue requiriendo JavaScript.
- Las rutas administrativas reciben X-Robots-Tag en Vercel y noindex en el navegador. No se bloquearon en robots.txt, para que los robots puedan leer noindex. Esto no sustituye autenticación.

## Alcance y pendientes

La revisión cubre identidad de marca, logo, descubrimiento e indexación del frontend. No es una certificación de todas las normas de seguridad, legales o de accesibilidad.

La consulta pública del dominio correcto respondió con contenido de Papagayo; no se pudo verificar robots.txt mediante el navegador de investigación. La web pública consultada presenta contenido diferente al proyecto local, por lo que los cambios deben publicarse en el proyecto que sirve este dominio.

Después de publicar:

1. Confirmar que /favicon.png, /images/papagayo-logo-google.png, /robots.txt y /sitemap.xml devuelvan archivos reales con HTTP 200, no el HTML de la app.
2. Verificar en Google Search Console la propiedad del dominio y enviar https://www.papagayofishingtourcr.com/sitemap.xml.
3. Usar Inspección de URLs para probar la página de inicio publicada y solicitar indexación.
4. Validar Organization con la prueba de resultados enriquecidos de Google.
5. Confirmar redirecciones permanentes de HTTP y del dominio sin www hacia HTTPS con www.
6. Comprobar la respuesta HTTP 404 de rutas inexistentes: la reescritura general de esta SPA puede devolver 200 y producir soft 404; requiere verificación en el alojamiento.

Google decide el título final y la aparición del favicon. El nuevo rastreo puede tomar días o semanas; no se garantiza aparición ni posicionamiento.

## Referencias

- https://developers.google.com/search/docs/appearance/favicon-in-search
- https://developers.google.com/search/docs/appearance/structured-data/organization
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
