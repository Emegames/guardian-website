# EME GAMES — versión preparada para publicar

Esta carpeta está preparada para publicar el frontend como sitio web estático. También incluye la configuración/documentación necesaria para conectar Supabase y Mercado Pago.

## Qué se preparó

- Revisión de la estructura del frontend.
- Favicon en las páginas.
- SEO básico y Open Graph en la página principal.
- `robots.txt` y `sitemap.xml`.
- Página `404.html`.
- `vercel.json` con cabeceras de seguridad básicas y caché de assets.
- `/admin/` y la página de prueba de Supabase marcadas como `noindex`.
- Año de copyright automático.
- Se conserva la Public Key de prueba de Mercado Pago para no romper las pruebas actuales.
- Se mantiene el Access Token exclusivamente del lado de Supabase Edge Functions.

## Importante: no se puede completar desde el ZIP

Hay tres acciones que requieren acceso a tus cuentas y por eso debes hacerlas tú:

1. Publicar el frontend en Vercel (o el hosting que elijas).
2. Configurar las URLs de autenticación de Supabase con la URL pública que te entregue Vercel.
3. Introducir tus credenciales reales de Mercado Pago como secrets de Supabase.

No pongas nunca un Access Token de Mercado Pago dentro de `js/` ni de ningún HTML.

## Publicar en Vercel

1. Entra a Vercel y crea/importa un proyecto nuevo.
2. Sube este proyecto desde GitHub o desde tu repositorio.
3. Si Vercel te pregunta por el directorio raíz, selecciona la carpeta que contiene `index.html`, `vercel.json` y `sitemap.xml`.
4. No necesitas un build command para este frontend estático.
5. Vercel te dará una URL `*.vercel.app`.
6. Después de conocer la URL exacta, reemplaza `https://TU-PROYECTO.vercel.app` en `robots.txt` y `sitemap.xml` por tu URL real.

La página principal debe abrir como:

`https://TU-PROYECTO.vercel.app/`

## Supabase después de publicar

En Supabase → Authentication → URL Configuration:

- Site URL: `https://TU-PROYECTO.vercel.app`
- Redirect URL: `https://TU-PROYECTO.vercel.app/pages/email-confirmado.html`

Si mantienes pruebas locales, puedes añadir también la URL local.

## Base de datos

Si todavía no ejecutaste la configuración inicial, abre Supabase → SQL Editor y ejecuta:

`SUPABASE_SETUP.sql`

No ejecutes el archivo repetidamente si ya existen las mismas restricciones/policies; si aparece un error de objeto existente, revisa qué parte ya fue creada antes de volver a ejecutar ese bloque.

## Edge Functions

Desde la raíz del proyecto, con Supabase CLI instalado y vinculado a tu proyecto:

```bash
supabase functions deploy create-donation --no-verify-jwt
supabase functions deploy process-mercadopago-payment --no-verify-jwt
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

Configura los secrets:

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="TU_ACCESS_TOKEN"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="TU_SECRETO_WEBHOOK"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son variables proporcionadas por Supabase a las Edge Functions; no las pongas en el frontend.

## Mercado Pago: primero prueba, después producción

El frontend conserva actualmente la Public Key de prueba en:

`js/mercadopago-config.js`

Cuando vayas a producción:

1. Crea/usa tu aplicación de Mercado Pago.
2. Copia su Public Key de producción a `js/mercadopago-config.js`.
3. Guarda el Access Token de producción únicamente como secret `MERCADOPAGO_ACCESS_TOKEN` en Supabase.
4. Configura el webhook hacia:

`https://TU-PROYECTO.supabase.co/functions/v1/mercadopago-webhook`

5. Prueba primero con credenciales/tarjetas de prueba.
6. Solo después cambia a las credenciales productivas.

## Google

Después de publicar:

1. Registra el sitio en Google Search Console.
2. Verifica la propiedad mediante el método que Google te indique.
3. Envía:

`https://TU-PROYECTO.vercel.app/sitemap.xml`

4. Usa la inspección de URL para solicitar el rastreo de la página principal.

La aparición en Google no es inmediata ni está garantizada para todas las URLs.

## Dominio propio

Este paquete NO configura ningún dominio personalizado. Puedes quedarte con la URL de Vercel y, si después quieres un dominio propio, conectarlo como un paso separado.

## Antes de cobrar dinero real

Revisa también las páginas `pages/privacidad.html` y `pages/terminos.html`: actualmente contienen textos de plantilla pendientes de publicación. Debes sustituirlos por los documentos legales que correspondan a tu proyecto antes de operar públicamente.
