# Mercado Pago + EME GAMES — Card Payment Brick + Orders API

La página de donaciones usa **Card Payment Brick** para capturar y tokenizar los datos de la tarjeta en el navegador. El navegador envía el token a Supabase; el **Access Token de Mercado Pago solo existe en la Edge Function** que crea la Order.

## 1. Mercado Pago

1. En **Tus integraciones**, crea o selecciona la aplicación que recibirá las donaciones.
2. Copia su **Public Key** y colócala en `js/mercadopago-config.js`.
3. Obtén el **Access Token** y guárdalo únicamente como secret de Supabase.
4. Configura el Webhook para:
   `https://TU-PROYECTO.supabase.co/functions/v1/mercadopago-webhook`
5. Conserva el secreto de firma del Webhook como secret de Supabase.

La Public Key sí puede estar en el frontend. **Nunca** pongas el Access Token o el secreto del Webhook en HTML/JS/CSS.

## 2. Supabase

Ejecuta en SQL Editor el bloque actualizado de `SUPABASE_SETUP.sql`.

Configura:

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="APP_USR_..."
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="..."
```

Despliega:

```bash
supabase functions deploy create-mercadopago-order
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

## 3. Public Key

Edita `js/mercadopago-config.js`:

```js
window.EMEMercadoPagoConfig = {
  publicKey: "TU_PUBLIC_KEY"
};
```

No sustituyas ese valor por el Access Token.

## 4. Flujo implementado

1. El visitante introduce el monto.
2. Se muestra Card Payment Brick directamente en la web.
3. Mercado Pago tokeniza los datos sensibles de la tarjeta.
4. El frontend envía token, método de pago, cuotas y datos mínimos del pagador a `create-mercadopago-order`.
5. La Edge Function crea `POST /v1/orders` usando el Access Token.
6. La respuesta inmediata muestra el estado disponible.
7. El Webhook valida `x-signature`, consulta nuevamente la Order/Payment y actualiza `public.donations`.

Los datos completos de la tarjeta no se guardan en Supabase ni en GitHub.

## 5. Pruebas

Prueba primero con credenciales y tarjetas de prueba de Mercado Pago para México. Comprueba aprobados, rechazados, pendientes, cuotas y Webhooks antes de usar credenciales productivas.
