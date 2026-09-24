# EME GAMES — Mercado Pago Card Payment Brick + Supabase

Esta versión utiliza **Card Payment Brick** para que el formulario de tarjeta aparezca dentro de `pages/donar.html`. Mercado Pago gestiona los campos sensibles de tarjeta; el sitio no almacena números de tarjeta ni CVV.

## Flujo

1. El visitante escribe el monto, entre **$0.01 y $10,000,000.00 MXN**.
2. `create-donation` crea un registro de donación en Supabase y fija el monto en el servidor.
3. Se muestra el Card Payment Brick de Mercado Pago dentro de la página.
4. Al enviar el formulario, el Brick entrega al backend el token de tarjeta y los datos necesarios.
5. `process-mercadopago-payment` compara el monto recibido con el monto guardado, crea el pago en Mercado Pago y usa `X-Idempotency-Key`.
6. `mercadopago-webhook` consulta y sincroniza el estado real del pago.

Mercado Pago documenta Card Payment Brick para tarjetas y su envío al backend; también exige `X-Idempotency-Key` para el procesamiento. La documentación actual de Checkout API marca Orders API como la vía recomendada para integraciones nuevas, mientras que la documentación de Card Payment Brick describe el envío de tarjetas mediante `/v1/payments`. Por compatibilidad directa con Card Payment Brick, esta implementación usa ese endpoint de pagos.

## 1. Crear la aplicación de Mercado Pago

Usa la cuenta de Mercado Pago que recibirá las donaciones y crea/selecciona una aplicación en **Tus integraciones**.

Para pruebas usa las credenciales de prueba. Para producción cambia al Access Token productivo.

## 2. Public Key del frontend

Edita:

`js/mercadopago-config.js`

y sustituye:

```js
window.EMEMercadoPagoConfig = {
  publicKey: "REEMPLAZAR_CON_PUBLIC_KEY"
};
```

por la **Public Key** de tu aplicación.

La Public Key puede estar en el frontend. **No pongas aquí el Access Token.**

## 3. Ejecutar el SQL

En Supabase > SQL Editor ejecuta `SUPABASE_SETUP.sql` completo si todavía no lo has ejecutado.

La tabla `public.donations` debe tener las columnas de donación que aparecen al final del archivo.

## 4. Secrets de Supabase

Configura como secrets de las Edge Functions:

```text
MERCADOPAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN
MERCADOPAGO_WEBHOOK_SECRET=TU_SECRETO_DE_WEBHOOK
```

Supabase ya proporciona a las Edge Functions estas variables internas:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

No las copies al frontend.

## 5. Desplegar funciones

Con Supabase CLI:

```bash
supabase functions deploy create-donation --no-verify-jwt
supabase functions deploy process-mercadopago-payment --no-verify-jwt
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

Luego:

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="TU_ACCESS_TOKEN"
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="TU_SECRETO_DE_WEBHOOK"
```

## 6. Webhook de Mercado Pago

Configura en Mercado Pago el webhook de pagos hacia:

```text
https://TU-PROYECTO.supabase.co/functions/v1/mercadopago-webhook
```

Activa las notificaciones relacionadas con pagos.

El webhook valida `x-signature` y después consulta el pago directamente a Mercado Pago antes de actualizar `public.donations`.

## 7. Pruebas

Primero prueba con las credenciales y tarjetas de prueba de Mercado Pago. No uses una tarjeta real mientras la aplicación esté configurada con credenciales de prueba.

Cuando todo funcione, cambia `js/mercadopago-config.js` a la Public Key productiva y el secret `MERCADOPAGO_ACCESS_TOKEN` al Access Token productivo.

## Seguridad

- Nunca guardes números de tarjeta ni CVV en Supabase.
- Nunca pongas `MERCADOPAGO_ACCESS_TOKEN` en HTML, CSS o JavaScript del navegador.
- El monto se valida tanto en frontend como en Edge Functions.
- El backend compara el monto enviado por el Brick contra el monto registrado antes de cobrar.
- Se utiliza una clave de idempotencia por solicitud de pago.
- El webhook vuelve a consultar el pago a Mercado Pago antes de actualizar su estado.
