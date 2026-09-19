# Mercado Pago + EME GAMES

La web quedó preparada para Checkout Pro de Mercado Pago. El navegador nunca contiene el Access Token ni el secreto del Webhook.

## 1. Supabase

1. Ejecuta en el SQL Editor el bloque de donaciones que se añadió al final de `SUPABASE_SETUP.sql`.
2. Despliega las dos Edge Functions:
   - `create-mercadopago-preference`
   - `mercadopago-webhook`
3. Configura estos secrets en Supabase:
   - `MERCADOPAGO_ACCESS_TOKEN`: Access Token de la aplicación de Mercado Pago.
   - `MERCADOPAGO_WEBHOOK_SECRET`: secreto generado en Mercado Pago en Webhooks.
   - `SITE_URL`: dominio público de la web, por ejemplo `https://tudominio.com`.

La página permite que cada visitante introduzca el monto que desea donar. El servidor acepta de $0.01 a $10,000,000.00 MXN y redondea a dos decimales. Mercado Pago puede rechazar importes que estén fuera de sus propios límites operativos.

Ejemplo con Supabase CLI:

```bash
supabase functions deploy create-mercadopago-preference
supabase functions deploy mercadopago-webhook --no-verify-jwt
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="APP_USR_..."
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="..."
supabase secrets set SITE_URL="https://tudominio.com"
```

## 2. Mercado Pago

1. Entra a **Mercado Pago** con la cuenta que recibirá las donaciones.
2. Abre **Tus integraciones** y crea o selecciona una aplicación para este sitio.
3. Copia el **Access Token de producción** cuando estés listo para cobrar dinero real.
4. Configura el Webhook de pagos en la URL indicada abajo y conserva el secreto generado por Mercado Pago.
5. Guarda ambos valores únicamente como **Secrets de Supabase**; nunca los pongas en HTML, CSS o JavaScript del navegador.

La API de Checkout Pro crea la preferencia desde el servidor y devuelve `init_point`, que es la URL a la que se redirige al usuario para completar el pago. Mercado Pago documenta que el Access Token debe enviarse en las solicitudes de creación de preferencias.



En **Tus integraciones** crea/usa una aplicación de Checkout Pro y usa sus credenciales productivas cuando vayas a cobrar de verdad.

Configura el Webhook productivo para la URL:

`https://TU-PROYECTO.supabase.co/functions/v1/mercadopago-webhook`

Activa las notificaciones de pagos. El código valida `x-signature` antes de guardar el estado del pago.

## 3. Flujo de la web

- La página `pages/donar.html` permite introducir un monto libre entre $0.01 y $10,000,000.00 MXN.
- El frontend llama a `create-mercadopago-preference`.
- La Edge Function crea una Preference en Mercado Pago y devuelve `init_point`.
- El visitante termina el pago en Mercado Pago.
- Mercado Pago devuelve al usuario a `donar.html?status=success|pending|failure`.
- El Webhook actualiza el registro correspondiente en `public.donations`.

No pegues el Access Token ni el secreto del Webhook en `js/`, HTML o CSS.
