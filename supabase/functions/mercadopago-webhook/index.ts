import { createClient } from 'jsr:@supabase/supabase-js@2';

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');
  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !accessToken || !supabaseUrl || !serviceRoleKey) return new Response('Webhook no configurado.', { status: 500 });

  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';
  const signature = req.headers.get('x-signature') ?? '';
  let ts = '';
  let v1 = '';

  for (const part of signature.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key?.trim() === 'ts') ts = value?.trim() ?? '';
    if (key?.trim() === 'v1') v1 = value?.trim() ?? '';
  }

  if (!dataId || !ts || !v1) return new Response('Firma incompleta.', { status: 401 });

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  if (!constantTimeEqual(expected, v1)) return new Response('Firma inválida.', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? body.action ?? '');
  if (!['payment', 'order', 'payment.created', 'payment.updated', 'order.created', 'order.updated'].includes(type)) {
    return new Response('ok', { status: 200 });
  }

  const endpoint = type.startsWith('order')
    ? `https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`
    : `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`;

  const resourceResponse = await fetch(endpoint, {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const resource = await resourceResponse.json().catch(() => ({}));
  if (!resourceResponse.ok) return new Response('No se pudo consultar Mercado Pago.', { status: 502 });

  const payment = type.startsWith('order') ? (resource?.transactions?.payments?.[0] ?? {}) : resource;
  const externalReference = resource?.external_reference ?? payment?.external_reference ?? '';
  if (!externalReference.startsWith('donation-')) return new Response('ok', { status: 200 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { error } = await admin.from('donations').update({
    status: payment?.status ?? resource?.status ?? 'unknown',
    order_id: resource?.id ? String(resource.id) : null,
    payment_id: payment?.id ? String(payment.id) : null,
    payment_status_detail: payment?.status_detail ?? resource?.status_detail ?? null,
    payment_type: payment?.payment_method?.type ?? payment?.payment_type_id ?? null,
    payer_email: payment?.payer?.email ?? resource?.payer?.email ?? null,
    paid_at: payment?.date_approved ?? resource?.date_approved ?? null,
    raw_payment: resource,
    updated_at: new Date().toISOString(),
  }).eq('external_reference', externalReference);

  if (error) {
    console.error(error);
    return new Response('No se pudo guardar el estado.', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
