# EME GAMES — publicación y autenticación

La página es un sitio estático y utiliza Supabase para autenticación y base de datos.

## Importante: 127.0.0.1

`127.0.0.1` / `localhost` solo apunta al dispositivo donde se está ejecutando el servidor local. Un teléfono no puede entrar a `127.0.0.1` de tu PC.

Para que cualquier persona pueda entrar desde cualquier dispositivo, publica esta carpeta en un hosting web (por ejemplo GitHub Pages, Netlify o Vercel) y usa esa URL pública en Supabase.

## Supabase: URLs de autenticación

En Supabase abre:

Authentication → URL Configuration

Configura:

- Site URL: la URL pública de tu página.
- Redirect URLs: agrega la URL pública de `pages/email-confirmado.html`.

Ejemplo:

`https://TU-DOMINIO/pages/email-confirmado.html`

Si también quieres seguir probando localmente, conserva una URL local adicional.

## Confirmación de correo

En Authentication → Providers → Email, activa la confirmación de correo (Confirm email).

## Correo duplicado

Supabase Auth mantiene el correo como identificador único. El frontend también detecta la respuesta de identidad vacía que Supabase puede devolver cuando se intenta registrar un correo que ya existe con confirmación de correo activada, y muestra un mensaje al usuario.

No se guarda el correo en `profiles` porque Supabase Auth ya es la fuente de verdad para el email.
