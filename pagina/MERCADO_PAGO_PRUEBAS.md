# Mercado Pago — pruebas con Card Payment Brick

La Public Key de prueba ya quedó configurada en:

`pagina/js/mercadopago-config.js`

No es necesario volver a colocarla.

## Falta configurar en Supabase

En los secrets de las Edge Functions configura:

- `MERCADOPAGO_ACCESS_TOKEN` → **Access Token de prueba** de la misma aplicación.
- `MERCADOPAGO_WEBHOOK_SECRET` → secreto de firma del webhook, si Mercado Pago lo muestra para la aplicación.

No compartas esos valores en el frontend ni en el repositorio.

## Funciones

Despliega:

```bash
supabase functions deploy create-donation
supabase functions deploy process-mercadopago-payment
supabase functions deploy mercadopago-webhook
```

## Página

El formulario está en:

`pagina/pages/donar.html`

El flujo es:

1. El usuario introduce el monto.
2. `create-donation` valida y guarda el monto.
3. Se monta el Card Payment Brick.
4. El Brick obtiene el token de tarjeta.
5. `process-mercadopago-payment` comprueba el monto guardado y crea el pago.
6. `mercadopago-webhook` consulta el pago y sincroniza su estado.

## Importante

La Public Key de prueba sí puede estar en `mercadopago-config.js`.
El Access Token y el secreto del webhook deben permanecer únicamente en Supabase Secrets.

Para pruebas usa únicamente las tarjetas de prueba y compradores de prueba proporcionados por Mercado Pago. No uses tarjetas reales con las credenciales de prueba.
